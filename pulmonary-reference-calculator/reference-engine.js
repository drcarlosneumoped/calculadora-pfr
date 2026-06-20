window.ReferenceEngine = (() => {
  const referenceData = window.ReferenceData || {};
  const equationSets = {
    spirometry: null,
    oscillometry: null,
    peakflow: null
  };

  function percent(value, reference) {
    if (!isFiniteNumber(value) || !isFiniteNumber(reference) || reference === 0) return null;
    return (value / reference) * 100;
  }

  function deltaPercentPredicted(pre, post, predicted) {
    if (!isFiniteNumber(pre) || !isFiniteNumber(post) || !isFiniteNumber(predicted) || predicted === 0) return null;
    return ((post - pre) / predicted) * 100;
  }

  function percentChange(pre, post) {
    if (!isFiniteNumber(pre) || !isFiniteNumber(post) || pre === 0) return null;
    return ((post - pre) / pre) * 100;
  }

  function zIsLow(z) {
    return isFiniteNumber(z) && z < -1.645;
  }

  function zIsHigh(z) {
    return isFiniteNumber(z) && z > 1.645;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function round(value, digits = 1) {
    if (!isFiniteNumber(value)) return "";
    return Number(value.toFixed(digits));
  }

  function bmi(weightKg, heightCm) {
    if (!isFiniteNumber(weightKg) || !isFiniteNumber(heightCm) || heightCm <= 0) return null;
    return weightKg / ((heightCm / 100) ** 2);
  }

  function splineRow(sex, age) {
    const rows = referenceData.spirometry?.splines?.[sex] || [];
    let selected = null;
    for (const row of rows) {
      if (row[0] <= age) selected = row;
      else break;
    }
    return selected || rows[0] || null;
  }

  function lmsZ(observed, predicted, s, l) {
    if (!isFiniteNumber(observed) || !isFiniteNumber(predicted) || !isFiniteNumber(s) || !isFiniteNumber(l) || observed <= 0 || predicted <= 0 || s === 0) return null;
    if (Math.abs(l) < 0.000001) return Math.log(observed / predicted) / s;
    return (((observed / predicted) ** l) - 1) / (l * s);
  }

  function spirometryReference(parameter, sex, age, heightCm, observed) {
    const spirometry = referenceData.spirometry;
    if (!spirometry?.parameters?.[sex] || !isFiniteNumber(age) || !isFiniteNumber(heightCm) || age <= 0 || heightCm <= 0) return null;
    const params = spirometry.parameters[sex][parameter];
    const row = splineRow(sex, age);
    if (!params || !row) return null;
    const offsets = { fev1: 1, fvc: 4, ratio: 7 };
    const index = offsets[parameter];
    const directRatio = parameter === "ratio" && sex === "male";
    let predicted;
    if (parameter === "ratio") {
      const lnPred = (params.m.height * heightCm) + (params.m.lnAge * Math.log(age)) + params.m.intercept + row[index];
      predicted = directRatio ? lnPred : Math.exp(lnPred);
    } else {
      const lnPred = (params.m.lnHeight * Math.log(heightCm)) + (params.m.lnAge * Math.log(age)) + params.m.intercept + row[index];
      predicted = Math.exp(lnPred);
    }
    const rawS = (params.s.lnAge * Math.log(age)) + params.s.intercept + row[index + 1];
    const s = directRatio ? rawS : Math.exp(rawS);
    const l = (params.l.lnAge * Math.log(age)) + params.l.intercept + row[index + 2];
    const lln = l === 0 ? predicted * Math.exp(-1.6449 * s) : predicted * ((1 - 1.6449 * l * s) ** (1 / l));
    return {
      predicted,
      lln,
      uln: l === 0 ? predicted * Math.exp(1.6449 * s) : predicted * ((1 + 1.6449 * l * s) ** (1 / l)),
      z: lmsZ(observed, predicted, s, l),
      s,
      l,
      source: spirometry.source
    };
  }

  const oscillometryBreakpoints = {
    R5: [7.37, 19.11],
    R20: [7.66, 17.86],
    "R5-R20": [23.56, Infinity],
    "R5-R20/R5": [7.9, 25.74],
    X5: [5.3, 18.69],
    AX: [6.99, 23.22],
    Fres: [9.7, 21]
  };

  function oscillometrySuffix(parameter, age) {
    const [first, second] = oscillometryBreakpoints[parameter] || [Infinity, Infinity];
    if (age < first) return "a";
    if (age < second) return "b";
    return "c";
  }

  function oscillometryReference(parameter, sex, age, heightCm, weightKg, observed) {
    const data = referenceData.oscillometry;
    const coefficients = data?.coefficients;
    const bodyMassIndex = bmi(weightKg, heightCm);
    if (!coefficients || !isFiniteNumber(age) || !isFiniteNumber(heightCm) || !isFiniteNumber(bodyMassIndex)) return null;
    const suffix = oscillometrySuffix(parameter, age);
    const keyBase = parameter === "R5-R20/R5" ? "(R5-R20)/R5" : parameter;
    const get = (part) => coefficients[`${keyBase}-${part}-${suffix}`]?.value;
    const intercept = get("int");
    const sexCoef = get("sexo");
    const ageCoef = get("edad");
    const heightCoef = get("est");
    const bmiCoef = get("imc");
    const rse = get("rse");
    if (![intercept, sexCoef, ageCoef, heightCoef, bmiCoef, rse].every(isFiniteNumber)) return null;
    const sexCode = sex === "male" ? 1 : 0;
    const linear = intercept + sexCoef * sexCode + ageCoef * age + heightCoef * (1 / heightCm) + bmiCoef * (1 / bodyMassIndex);
    const logParameters = new Set(["AX"]);
    const predicted = logParameters.has(parameter) ? Math.exp(linear) : linear;
    const lln = logParameters.has(parameter) ? Math.exp(Math.log(predicted) - 1.6449 * rse) : predicted - 1.6449 * rse;
    const uln = logParameters.has(parameter) ? Math.exp(Math.log(predicted) + 1.6449 * rse) : predicted + 1.6449 * rse;
    const z = logParameters.has(parameter)
      ? (isFiniteNumber(observed) && observed > 0 ? (Math.log(observed) - Math.log(predicted)) / rse : null)
      : (isFiniteNumber(observed) ? (observed - predicted) / rse : null);
    return { predicted, lln, uln, z, source: data.source };
  }

  function bloodGasReference(age, sex, pao2, paco2) {
    const pao2Pred = isFiniteNumber(age) ? 77.5 - 0.16 * age : null;
    const paco2Pred = sex === "female" && isFiniteNumber(age) ? 26.3 + 0.075 * age : null;
    return {
      pao2Pred,
      pao2ZLike: isFiniteNumber(pao2) && isFiniteNumber(pao2Pred) ? (pao2 - pao2Pred) / 6 : null,
      paco2Pred,
      paco2Delta: isFiniteNumber(paco2) && isFiniteNumber(paco2Pred) ? paco2 - paco2Pred : null,
      source: "Arterial blood gases in normal subjects at 2240 meters above sea level"
    };
  }

  function pefReference(kind, sex, age, heightCm, weightKg, observed) {
    const cells = referenceData.peakflow?.rawCoefficientCells || {};
    const columns = {
      mechanical: sex === "male" ? "AD" : "AD",
      spirometry: sex === "male" ? "AF" : "AF",
      pif: sex === "male" ? "AH" : "AH"
    };
    const col = columns[kind] || columns.mechanical;
    if (!isFiniteNumber(age) || !isFiniteNumber(heightCm) || !isFiniteNumber(weightKg)) return null;
    const sexTerm = sex === "male" ? Number(cells[`${col}3`] || 0) : 0;
    const lnPred = sexTerm
      + Number(cells[`${col}4`]) * weightKg
      + Number(cells[`${col}5`]) * heightCm
      + Number(cells[`${col}6`]) * age
      + Number(cells[`${col}7`]) * (age ** 2)
      + Number(cells[`${col}8`]);
    const rmse = Number(cells[`${col}9`]);
    if (![lnPred, rmse].every(isFiniteNumber)) return null;
    const predicted = Math.exp(lnPred);
    const lln = Math.exp(lnPred - 1.64 * rmse);
    const uln = Math.exp(lnPred + 1.64 * rmse);
    const z = isFiniteNumber(observed) && observed > 0 ? (Math.log(observed) - lnPred) / rmse : null;
    return { predicted, lln, uln, z, source: referenceData.peakflow?.source };
  }

  const pediatricDlco = {
    male: {
      dlco: { mean: [0.03251, 0.00846, 0.00304, 1.63469], lln: [0.01521, 0.01341, 0.00247, 0.91658], uln: [0.03708, 0.0074, 0.00247, 1.97268] },
      va: { mean: [0.03152, 0.00772, 0.00525, -0.42773], lln: [0.02565, 0.00775, 0.00704, -0.6416], uln: [0.04563, 0.00456, 0.00627, 0.03585] },
      tlc: { mean: [0.02907, 0.00977, 0.00287, -0.57111], lln: [0.01598, 0.01256, 0.00328, -1.04013], uln: [0.03998, 0.00505, 0.00607, 0.05328] },
      rv: { mean: [0.03641, 0.00415, -0.00085, -1.04676], lln: [0.04319, -0.00089, 0.00404, -1.10582], uln: [0.01622, -0.00263, 0.01131, 0.19077] }
    },
    female: {
      dlco: { mean: [0.01933, 0.00893, 0.00273, 1.56516], lln: [0.0173, 0.01314, 0.0026, 0.71846], uln: [0.02206, 0.00977, 0.00063, 1.7166] },
      va: { mean: [0.01772, 0.00944, 0.00476, -0.60641], lln: [0.00871, 0.01671, -0.00053, -1.51895], uln: [0.03761, 0.00523, 0.00551, -0.0785] },
      tlc: { mean: [0.01732, 0.01012, 0.00387, -0.63712], lln: [0.0082, 0.01651, 0.0001, -1.47683], uln: [0.03427, 0.00644, 0.00375, -0.11338] },
      rv: { mean: [0.01419, 0.00667, -0.00514, -1.11793], lln: [0.0029, 0.00719, -0.0051, -1.62977], uln: [0.03873, -0.00176, -0.00392, 0.27499] }
    }
  };

  const adultDlco = {
    male: {
      dlco: {
        predicted: ({ age, heightM, altitudeKm, hb }) => (-0.00211 * age ** 2) + (392.1 * heightM) - (104.9 * heightM ** 2) + (1.594 * altitudeKm ** 2) + (1.151 * hb) - 346.1,
        lln: ({ age, heightM, altitudeKm, hb }) => (-0.149 * age) + (38.76 * heightM) + (0.852 * altitudeKm ** 2) + (1.677 * hb) - 60.05,
        upperSigma: 5.153
      },
      va: {
        predicted: ({ age, heightM, altitudeKm }) => (0.0121 * age) + (7.877 * heightM) + (0.172 * altitudeKm) - 8.115,
        lln: ({ heightM, altitudeKm }) => (5.968 * heightM) + (0.051 * altitudeKm) - 5.231,
        upperSigma: 0.688
      },
      kco: {
        predicted: ({ age, heightM, altitudeKm, hb }) => (-0.0435 * age) - (0.785 * heightM) + (0.632 * altitudeKm) + (0.171 * hb) + 5.432,
        lln: ({ age, heightM, altitudeKm, hb }) => (-0.0409 * age) - (0.329 * heightM) + (0.511 * altitudeKm) + (0.265 * hb) + 2.157,
        upperSigma: 0.757
      }
    },
    female: {
      dlco: {
        predicted: ({ age, heightM, weightKg, altitudeKm, hb }) => (-0.168 * age) + (19.65 * heightM) + (0.0765 * weightKg) + (0.892 * altitudeKm ** 2) + (0.967 * hb) - 19.91,
        lln: ({ age, heightM, altitudeKm, hb }) => (-0.00114 * age ** 2) + (21.02 * heightM) + (0.831 * altitudeKm ** 2) + (0.892 * hb) - 26.47,
        upperSigma: 3.806
      },
      va: {
        predicted: ({ heightM, altitudeKm }) => (5.188 * heightM) + (0.094 * altitudeKm) - 3.914,
        lln: ({ heightM, altitudeKm }) => (6.134 * heightM) + (0.162 * altitudeKm) - 6.3,
        upperSigma: 0.517
      },
      kco: {
        predicted: ({ age, heightM, weightKg, altitudeKm, hb }) => (-0.0377 * age) - (2.177 * heightM) + (0.0166 * weightKg) + (0.49 * altitudeKm) + (0.244 * hb) + 5.495,
        lln: ({ age, heightM, altitudeKm, hb }) => (-0.0237 * age) + (0.172 * heightM) + (0.337 * altitudeKm) + (0.186 * hb) + 2.044,
        upperSigma: 0.783
      }
    }
  };

  function asymmetricZ(observed, predicted, lln, uln) {
    if (![observed, predicted, lln, uln].every(isFiniteNumber)) return null;
    const sigma = observed < predicted ? (lln - predicted) / -1.64 : (uln - predicted) / 1.64;
    return sigma > 0 ? (observed - predicted) / sigma : null;
  }

  function pediatricDlcoValue(coefficients, age, heightCm, weightKg) {
    const linear = coefficients[0] * age + coefficients[1] * heightCm + coefficients[2] * weightKg + coefficients[3];
    return Math.exp(linear);
  }

  function dlcoReference(parameter, sex, age, heightCm, weightKg, observed, hb, altitudeKm = 2.24) {
    if (!["male", "female"].includes(sex) || !isFiniteNumber(age) || !isFiniteNumber(heightCm) || !isFiniteNumber(weightKg)) return null;
    if (age >= 4 && age <= 20) {
      const coefficients = pediatricDlco[sex]?.[parameter];
      if (!coefficients) return null;
      const predicted = pediatricDlcoValue(coefficients.mean, age, heightCm, weightKg);
      const lln = pediatricDlcoValue(coefficients.lln, age, heightCm, weightKg);
      const uln = pediatricDlcoValue(coefficients.uln, age, heightCm, weightKg);
      return {
        predicted,
        lln,
        uln,
        z: asymmetricZ(observed, predicted, lln, uln),
        source: "pediatric"
      };
    }

    if (age > 20) {
      const coefficients = adultDlco[sex]?.[parameter];
      if (!coefficients || !isFiniteNumber(altitudeKm)) return null;
      if ((parameter === "dlco" || parameter === "kco") && !isFiniteNumber(hb)) return null;
      const context = { age, heightM: heightCm / 100, weightKg, hb, altitudeKm };
      const predicted = coefficients.predicted(context);
      const lln = coefficients.lln(context);
      const uln = predicted + 1.64 * coefficients.upperSigma;
      return {
        predicted,
        lln,
        uln,
        z: asymmetricZ(observed, predicted, lln, uln),
        source: "adult"
      };
    }

    return null;
  }

  return {
    equationSets,
    percent,
    deltaPercentPredicted,
    percentChange,
    zIsLow,
    zIsHigh,
    isFiniteNumber,
    round,
    bmi,
    spirometryReference,
    oscillometryReference,
    bloodGasReference,
    pefReference,
    dlcoReference
  };
})();
