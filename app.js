const $ = (id) => document.getElementById(id);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));
const R = window.ReferenceEngine;
const DATABASE_KEY = "calculadoraPfrDatabase";
let lastReportContext = null;

const studies = {
  spirometry: { label: "Espirometría", calculate: calculateSpirometry },
  oscillometry: { label: "Oscilometría", calculate: calculateOscillometry },
  feno: { label: "FeNO", calculate: calculateFeno },
  peakflow: { label: "Flujometría", calculate: calculatePeakflow },
  dlco: { label: "DLCO", calculate: calculateDlco },
  bloodgas: { label: "Gasometría", calculate: calculateBloodGas }
};

const studyFields = {
  spirometry: ["fev1Pre", "fev1Post", "fvcPre", "fvcPost"],
  oscillometry: ["r5Pre", "r5Post", "r20Pre", "r20Post", "x5Pre", "x5Post", "axPre", "axPost", "fresPre", "fresPost"],
  feno: ["fenoValue"],
  peakflow: ["pefActual", "pefPred", "pefBest", "pefMax", "pefMin"],
  dlco: ["dlcoValue", "dlcoVa", "dlcoTlc", "dlcoRv", "dlcoHb"],
  bloodgas: ["ph", "paco2", "pao2", "baseExcess", "fio2", "gasCity"]
};

const fields = [
  "patientName", "studyDate", "birthDate", "age", "sex", "height", "weight",
  "spiroQuality", "spiroQualityNote", "fev1Pre", "fev1Post", "fev1Pred", "fvcPre", "fvcPost", "fvcPred", "ratioPre", "ratioPost", "ratioPred", "ratioLln", "fev1Z", "fvcZ",
  "r5Pre", "r5Post", "r5Uln", "r5Z", "r20Pre", "r20Post", "r20Uln", "r20Z", "r5r20Pre", "r5r20Post", "r5r20Uln", "r5r20Z", "r5r20RatioPre", "r5r20RatioPost", "r5r20RatioUln", "r5r20RatioZ", "x5Pre", "x5Post", "x5Lln", "x5Z",
  "axPre", "axPost", "axUln", "axZ", "fresPre", "fresPost", "fresUln", "fresZ",
  "fenoValue", "fenoAgeGroup", "icsUse", "hasPreviousFeno", "previousFenoValue", "previousFenoDate", "pefActual", "pefPred", "pefBest", "pefMax", "pefMin",
  "dlcoValue", "dlcoVa", "dlcoKco", "dlcoTlc", "dlcoRv", "dlcoHb", "dlcoAltitude",
  "ph", "paco2", "pao2", "hco3", "sao2", "baseExcess", "fio2", "gasCity", "lactate"
];

const referenceLabels = {
  spirometry: "Martinez-Briseno et al. 2019. Valores de referencia para espirometría en población mexicana.",
  oscillometry: "Gochicoa-Rangel L et al. 2023. Valores de referencia de oscilometría en mexicanos de 2.7 a 90 años.",
  peakflow: "Gochicoa et al. 2022. Valores de referencia para flujo espiratorio pico en población mexicana.",
  dlcoPediatric: "Gochicoa-Rangel L et al. Diffusing Capacity of the Lung for Carbon Monoxide in Mexican/Latino Children: Quality Control and Reference Values. Ann Am Thorac Soc. 2019;16(1):48-55.",
  dlcoAdult: "Vázquez-García JC, Pérez-Padilla R, Casas A, et al. Reference Values for the Diffusing Capacity Determined by the Single-Breath Technique at Different Altitudes: The Latin American Single-Breath Diffusing Capacity Reference Project. Respir Care. 2016;61(9):1217-1223.",
  feno: "ATS clinical practice guideline: Interpretation of exhaled nitric oxide levels for clinical applications.",
  bloodgas: "Arterial blood gases in normal subjects at 2240 meters above sea level: impact of age, gender and BMI."
};

function numberValue(id) {
  const element = $(id);
  if (!element) return null;
  const value = element.value.trim();
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(id) {
  return $(id)?.value.trim() || "";
}

function selectedStudies() {
  return qsa(".study-check")
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function hasStudyData(study) {
  return studyFields[study].some((id) => {
    const element = $(id);
    if (!element) return false;
    if (element.tagName === "SELECT") return element.value !== "" && id !== "fenoAgeGroup";
    return element.value.trim() !== "";
  });
}

function calculateAge() {
  const birth = textValue("birthDate");
  const study = textValue("studyDate");
  if (!birth || !study) {
    $("age").value = "";
    return null;
  }

  const birthDate = new Date(`${birth}T00:00:00`);
  const studyDate = new Date(`${study}T00:00:00`);
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(studyDate.getTime()) || studyDate < birthDate) {
    $("age").value = "";
    return null;
  }

  const years = (studyDate - birthDate) / (365.2425 * 24 * 60 * 60 * 1000);
  $("age").value = years.toFixed(2);
  return years;
}

function fmt(value, digits = 1, suffix = "") {
  return R.isFiniteNumber(value) ? `${R.round(value, digits)}${suffix}` : "";
}

function tableCell(value, className = "") {
  const text = value || "";
  return { text, className };
}

function zCell(value, isAbnormal) {
  return tableCell(fmt(value, 2), isAbnormal ? "z-abnormal" : "");
}

function bdCell(value, isResponder) {
  return tableCell(fmt(value, 1), isResponder ? "bd-response" : "");
}

function row(label, values) {
  return `<tr><td>${label}</td>${values.map((value) => {
    if (value && typeof value === "object") {
      return `<td${value.className ? ` class="${value.className}"` : ""}>${value.text || ""}</td>`;
    }
    return `<td>${value || ""}</td>`;
  }).join("")}</tr>`;
}

function setNumber(id, value, digits = 2) {
  const element = $(id);
  if (!element) return;
  element.value = R.isFiniteNumber(value) ? value.toFixed(digits) : "";
}

function table(title, headers, rows) {
  if (!rows.length) return "";
  return `<h3>${title}</h3><table class="result-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function tableDataFromReport() {
  return qsa("#resultTables .result-table").map((tableElement) => {
    const title = tableElement.previousElementSibling?.tagName === "H3" ? tableElement.previousElementSibling.textContent.trim() : "";
    const headers = qsa("thead th", tableElement).map((cell) => cell.textContent.trim());
    const rows = qsa("tbody tr", tableElement).map((tr) => {
      const cells = qsa("td", tr).map((cell) => cell.textContent.trim());
      return Object.fromEntries(headers.map((header, index) => [header || `columna_${index + 1}`, cells[index] || ""]));
    });
    return { title, headers, rows };
  });
}

function rawInputData() {
  return Object.fromEntries(fields.map((id) => {
    const element = $(id);
    if (!element) return [id, ""];
    return [id, element.type === "checkbox" ? element.checked : element.value];
  }));
}

function addFinding(findings, text, tone = "warn") {
  if (text) findings.push({ text, tone });
}

function cleanText(value) {
  return String(value || "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]));
}

function section(title, text) {
  return { title, text };
}

function currentSpirometryMode() {
  return document.querySelector('input[name="spirometryMode"]:checked')?.value || "simple";
}

function spirometryLabel() {
  return currentSpirometryMode() === "bd" ? "Espirometría con broncodilatador" : "Espirometría simple";
}

function studyLabel(study) {
  if (study === "integrated") return "Interpretación integral";
  return study === "spirometry" ? spirometryLabel() : studies[study].label;
}

function zSeverity(z) {
  if (!R.isFiniteNumber(z)) return "";
  if (z <= -4.0) return "grave";
  if (z <= -2.51) return "moderado";
  if (z <= -1.65) return "leve";
  return "";
}

function highZSeverity(z) {
  if (!R.isFiniteNumber(z)) return "";
  if (z >= 4.0) return "grave";
  if (z >= 2.51) return "moderado";
  if (z >= 1.65) return "leve";
  return "";
}

function spirometryLow(ref) {
  if (!ref) return false;
  if (!R.isFiniteNumber(ref.observed)) return false;
  if (R.isFiniteNumber(ref.z)) return ref.z <= -1.645;
  return R.isFiniteNumber(ref.observed) && R.isFiniteNumber(ref.lln) && ref.observed <= ref.lln;
}

function spirometryMeasured(ref) {
  return !!ref && R.isFiniteNumber(ref.observed);
}

function severitySuffix(z) {
  const severity = zSeverity(z);
  return severity ? ` ${severity}` : "";
}

function spirometryPattern(ratioRef, fvcRef, fev1Ref) {
  if (!ratioRef && !fvcRef && !fev1Ref) return "sin datos suficientes para interpretar";
  const lowRatio = spirometryLow(ratioRef);
  const lowFvc = spirometryLow(fvcRef);
  const lowFev1 = spirometryLow(fev1Ref);
  const normalFvc = fvcRef && !lowFvc;
  const normalFev1 = fev1Ref && !lowFev1;

  if (!spirometryMeasured(ratioRef) || !spirometryMeasured(fvcRef) || !spirometryMeasured(fev1Ref)) return "sin datos suficientes para interpretar";

  if (!lowRatio) {
    if (normalFvc && normalFev1) return "normal";
    if (lowFvc) return `sugerente de restricción${severitySuffix(fvcRef.z)}`;
    if (lowFev1) return "PRISm";
  }
  if (lowRatio && normalFvc) {
    return normalFev1 ? "obstructivo con FEV1 dentro de límites normales" : `obstructivo${severitySuffix(fev1Ref.z)}`;
  }
  if (lowRatio && lowFvc) return `posible trastorno mixto${severitySuffix(fev1Ref.z)}`;
  return "no clasificado";
}

function spirometryPatternKey(ratioRef, fvcRef, fev1Ref) {
  if (!spirometryMeasured(ratioRef) || !spirometryMeasured(fvcRef) || !spirometryMeasured(fev1Ref)) return "insufficient";
  const lowRatio = spirometryLow(ratioRef);
  const lowFvc = spirometryLow(fvcRef);
  const lowFev1 = spirometryLow(fev1Ref);
  if (!lowRatio && !lowFvc && !lowFev1) return "normal";
  if (!lowRatio && lowFvc) return "restriction";
  if (!lowRatio && lowFev1) return "prism";
  if (lowRatio && !lowFvc) return "obstruction";
  if (lowRatio && lowFvc) return "mixed";
  return "unclassified";
}

function svgText(lines, x, y, options = {}) {
  const lineHeight = options.lineHeight || 16;
  const anchor = options.anchor || "middle";
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  return `<text x="${x}" y="${startY}" text-anchor="${anchor}"${weight}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${cleanText(line)}</tspan>`).join("")}</text>`;
}

function svgBox(key, x, y, width, height, lines, activeKeys, className = "") {
  const active = activeKeys.includes(key) ? " active" : "";
  return `
    <g class="flow-node ${className}${active}" data-flow-key="${key}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2"></rect>
      ${svgText(lines, x + width / 2, y + height / 2 + 5)}
    </g>
  `;
}

function svgPath(d, label = "", labelX = 0, labelY = 0) {
  return `<path class="flow-line" d="${d}" marker-end="url(#arrow)"></path>${label ? `<text class="flow-label" x="${labelX}" y="${labelY}" text-anchor="middle">${cleanText(label)}</text>` : ""}`;
}

function svgDefs() {
  return `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z"></path>
      </marker>
    </defs>
  `;
}

function spirometryAlgorithmHtml(activeKeys, hasBd) {
  const active = activeKeys.length ? [...activeKeys] : ["insufficient"];
  if (active.some((key) => key === "obstruction" || key === "mixed")) active.push("severity");
  if (active.some((key) => key === "restriction" || key === "mixed" || key === "prism")) active.push("volumes");
  return `
    <article class="algorithm-card">
      <h4>${hasBd ? "Espirometría con broncodilatador" : "Espirometría simple"}</h4>
      <p>Algoritmo ATS/ERS 2022 basado en z-score. Punto de corte de anormalidad: z <= -1.645.</p>
      <div class="flowchart-wrap">
        <svg class="flowchart-svg spirometry-svg" viewBox="0 0 1040 520" role="img" aria-label="Diagrama de flujo de interpretación de espirometría">
          ${svgDefs()}
          ${svgBox("normal", 42, 38, 170, 62, ["Espirometría", "normal"], active, "terminal")}
          ${svgBox("ratio", 456, 14, 190, 70, ["FEV1/FVC", "z <= -1.645"], active)}
          ${svgBox("fev1-check", 42, 160, 190, 70, ["FEV1", "z <= -1.645"], active)}
          ${svgBox("fvc-left", 305, 160, 190, 70, ["FVC", "z <= -1.645"], active)}
          ${svgBox("fvc-right", 555, 160, 190, 70, ["FVC", "z <= -1.645"], active)}
          ${svgBox("obstruction", 862, 160, 170, 70, ["Obstrucción", "al flujo aéreo"], active, "terminal")}
          ${svgBox("prism", 8, 300, 260, 70, ["Relación preservada", "con FEV1 reducido", "(PRISm)"], active, "terminal")}
          ${svgBox("restriction", 310, 300, 190, 70, ["Posible", "restricción"], active, "terminal")}
          ${svgBox("mixed", 555, 300, 190, 70, ["Posible trastorno", "mixto"], active, "terminal")}
          ${svgBox("severity", 800, 300, 220, 116, ["Severidad por FEV1", "z > -2.5  Leve", "-2.51 a -4  Moderado", "z <= -4.0  Grave"], active, "severity-node")}
          ${svgBox("volumes", 360, 444, 190, 58, ["Confirmar con", "volúmenes pulmonares"], active, "terminal")}
          ${svgBox("insufficient", 780, 440, 190, 56, ["No interpretable", "datos insuficientes"], active, "terminal optional-node")}
          ${svgPath("M551 84 L551 122 L400 122 L400 160", "No", 520, 116)}
          ${svgPath("M551 84 L551 122 L650 122 L650 160", "Sí", 590, 116)}
          ${svgPath("M305 195 L232 195", "No", 270, 188)}
          ${svgPath("M137 160 L137 100", "No", 160, 138)}
          ${svgPath("M137 230 L137 300", "Sí", 112, 260)}
          ${svgPath("M400 230 L400 300", "Sí", 428, 260)}
          ${svgPath("M650 230 L650 300", "Sí", 680, 260)}
          ${svgPath("M745 195 L862 195", "No", 805, 188)}
          ${svgPath("M947 230 L947 300")}
          ${svgPath("M745 335 L800 335")}
          ${svgPath("M138 370 L138 404 L455 404 L455 444")}
          ${svgPath("M405 370 L405 444")}
          ${svgPath("M650 370 L650 404 L455 404")}
        </svg>
      </div>
      <p class="algorithm-note">El cuadro amarillo corresponde al desenlace usado para redactar la interpretación${hasBd ? " basal y/o postbroncodilatador" : ""}.</p>
    </article>
  `;
}

function oscillometryAlgorithmHtml(activeKeys) {
  const active = activeKeys.length ? activeKeys : ["insufficient"];
  return `
    <article class="algorithm-card">
      <h4>Oscilometría</h4>
      <p>Algoritmo de patrones por límites de normalidad: resistencias, AX y Fres elevados si superan LSN; X5 anormal si es menor al LIN.</p>
      <div class="flowchart-wrap">
        <svg class="flowchart-svg" viewBox="0 0 760 420" role="img" aria-label="Diagrama de flujo de interpretación de oscilometría">
          ${svgDefs()}
          ${svgBox("start", 295, 18, 170, 62, ["Parámetros", "R5 R20 X5 AX Fres"], active)}
          ${svgBox("normal-check", 285, 116, 190, 62, ["¿Todos", "normales?"], active)}
          ${svgBox("normal", 34, 270, 148, 66, ["Normal"], active, "terminal")}
          ${svgBox("peripheral", 214, 270, 164, 74, ["Obstrucción", "periférica"], active, "terminal")}
          ${svgBox("central", 410, 270, 154, 74, ["Obstrucción", "central"], active, "terminal")}
          ${svgBox("restriction", 596, 270, 154, 74, ["Sugerente de", "restricción"], active, "terminal")}
          ${svgBox("unclassified", 306, 354, 150, 54, ["Anormal", "no clasificado"], active, "terminal")}
          ${svgBox("insufficient", 10, 354, 164, 54, ["No interpretable"], active, "terminal")}
          ${svgPath("M380 80 L380 116")}
          ${svgPath("M285 146 L108 146 L108 270", "Sí", 220, 138)}
          ${svgPath("M475 146 L650 146 L650 270", "No", 535, 138)}
          ${svgPath("M380 178 L296 270", "R5-R20 alto", 286, 230)}
          ${svgPath("M380 178 L487 270", "R5 y R20 altos", 500, 230)}
          ${svgPath("M380 178 L650 270", "X5/AX/Fres", 620, 235)}
          ${svgPath("M380 178 L380 354")}
        </svg>
      </div>
      <p class="algorithm-note">El cuadro amarillo corresponde al patrón usado para la interpretación basal y/o postbroncodilatador.</p>
    </article>
  `;
}

function dlcoAlgorithmHtml(activeKey, source) {
  const active = [activeKey || "insufficient"];
  return `
    <article class="algorithm-card">
      <h4>DLCO</h4>
      <p>Algoritmo de interpretación de DLCO por LIN/LSN e integración con VA y KCO.</p>
      <div class="flowchart-wrap">
        <svg class="flowchart-svg dlco-svg" viewBox="0 0 880 430" role="img" aria-label="Diagrama de flujo de interpretación de DLCO">
          ${svgDefs()}
          ${svgBox("start", 390, 26, 120, 60, ["DLCO"], active)}
          ${svgBox("low", 235, 150, 135, 62, ["DLCO", "< LIN"], active)}
          ${svgBox("normal", 390, 150, 140, 62, ["DLCO", "normal"], active, "terminal")}
          ${svgBox("high", 646, 150, 168, 82, ["DLCO alta", "flujo sanguíneo alto,", "asma/obesidad,", "hemorragia"], active, "terminal")}
          ${svgBox("va", 235, 262, 135, 58, ["VA"], active)}
          ${svgBox("low-va-low-kco", 32, 340, 210, 70, ["Pérdida de volumen", "o estructura", "alveolocapilar"], active, "terminal")}
          ${svgBox("low-va-high-kco", 330, 340, 230, 70, ["Pérdida localizada", "de volumen o expansión", "incompleta"], active, "terminal")}
          ${svgBox("low-va-normal", 570, 306, 220, 84, ["Anormalidad vascular", "pulmonar, anemia o", "enfisema con VA preservado"], active, "terminal")}
          ${svgBox("insufficient", 32, 32, 180, 58, ["No interpretable", "faltan datos"], active, "terminal")}
          ${svgPath("M390 56 L302 56 L302 150", "<LIN", 340, 48)}
          ${svgPath("M510 56 L730 56 L730 150", ">LSN", 626, 48)}
          ${svgPath("M450 86 L450 150", "normal", 492, 124)}
          ${svgPath("M302 212 L302 262")}
          ${svgPath("M235 291 L137 291 L137 340", "VA baja", 184, 283)}
          ${svgPath("M370 291 L445 291 L445 340", "KCO alta", 412, 283)}
          ${svgPath("M370 291 L680 291 L680 306", "VA normal", 525, 283)}
        </svg>
      </div>
      <p class="algorithm-note">El cuadro amarillo corresponde al desenlace usado para redactar la interpretación.</p>
    </article>
  `;
}

function simpleAlgorithmHtml(title, description, boxes, activeKey) {
  const active = [activeKey || "insufficient"];
  const width = 760;
  const boxWidth = 150;
  const gap = boxes.length > 1 ? (width - (boxes.length * boxWidth)) / (boxes.length + 1) : 305;
  const nodes = boxes.map((box, index) => {
    const x = gap + index * (boxWidth + gap);
    return {
      ...box,
      x,
      center: x + boxWidth / 2,
      lines: [box.title, ...(box.detail ? String(box.detail).split("|") : [])]
    };
  });
  return `
    <article class="algorithm-card">
      <h4>${title}</h4>
      <p>${description}</p>
      <div class="flowchart-wrap">
        <svg class="flowchart-svg simple-svg" viewBox="0 0 760 245" role="img" aria-label="Diagrama de flujo de ${cleanText(title)}">
          ${svgDefs()}
          ${svgBox("start", 305, 18, 150, 54, ["Resultado", "ingresado"], active)}
          ${nodes.map((node) => svgBox(node.key, node.x, 150, boxWidth, 62, node.lines, active, "terminal")).join("")}
          ${nodes.map((node) => svgPath(`M380 72 L380 108 L${node.center} 108 L${node.center} 150`)).join("")}
        </svg>
      </div>
      <p class="algorithm-note">El cuadro amarillo corresponde al desenlace usado para redactar la interpretación.</p>
    </article>
  `;
}

function spirometrySentence(kind, pattern) {
  const period = pattern.endsWith(".") ? "" : ".";
  if (kind === "simple") return `Espirometría simple con patrón ${pattern}${period}`;
  if (kind === "basal") return `El estudio basal se encuentra con un patrón ${pattern}${period}`;
  return `El estudio postbroncodilatador se encuentra con un patrón ${pattern}${period}`;
}

function spirometryQualityText() {
  const quality = $("spiroQuality")?.value || "acceptable";
  const note = textValue("spiroQualityNote");
  const labels = {
    acceptable: "Aceptable.",
    reserve: "Con reservas.",
    uninterpretable: "No interpretable."
  };
  return `${labels[quality] || "Aceptable."}${note ? ` ${note}` : ""}`;
}

function bdParameterResponse(label, pre, post, preZ, postZ) {
  if (!R.isFiniteNumber(pre) || !R.isFiniteNumber(post)) return null;
  const deltaL = post - pre;
  const deltaPct = pre !== 0 ? (deltaL / pre) * 100 : null;
  const deltaZ = R.isFiniteNumber(preZ) && R.isFiniteNumber(postZ) ? postZ - preZ : null;
  const positiveByVolume = R.isFiniteNumber(deltaPct) && deltaPct >= 12 && deltaL >= 0.1;
  const positiveByZ = R.isFiniteNumber(deltaZ) && deltaZ >= 0.5;
  return { label, deltaL, deltaPct, deltaZ, positive: positiveByVolume || positiveByZ };
}

function spirometryBdText(responses) {
  const valid = responses.filter(Boolean);
  if (!valid.length) return "La prueba a broncodilatador no es evaluable por datos insuficientes.";
  const positive = valid.filter((item) => item.positive);
  return positive.length
    ? "La prueba a broncodilatador es positiva."
    : "La prueba a broncodilatador es negativa.";
}

function oscillometryPattern(values) {
  const byLabel = Object.fromEntries(values.map((item) => [item.label, item]));
  const state = (label) => byLabel[label]?.state || "normal";
  const observed = (label) => byLabel[label]?.observed;
  const measured = values.filter((item) => R.isFiniteNumber(item.observed));
  if (!measured.length) return "Sin datos suficientes para interpretar.";
  if (measured.some((item) => item.state === "unknown")) return "Sin valores de referencia suficientes para clasificar el patrón; confirme edad, sexo, talla y peso.";
  const normal = ["R5", "R20", "R5-R20", "X5", "AX", "Fres"].every((label) => state(label) === "normal");
  if (normal) return "Oscilometría normal.";

  const r5High = state("R5") === "high";
  const r20High = state("R20") === "high";
  const r5r20High = state("R5-R20") === "high";
  const r5r20RatioHigh = R.isFiniteNumber(observed("(R5-R20)/R5")) && observed("(R5-R20)/R5") > 0.3;
  const x5Low = state("X5") === "low";
  const axHigh = state("AX") === "high";
  const fresHigh = state("Fres") === "high";

  if (r5High && r20High && !r5r20High && !x5Low && !axHigh && !fresHigh) return "Obstrucción central.";
  if (!r5High && !r20High && !r5r20High && (x5Low || axHigh || fresHigh)) return "Sugerente de restricción.";
  if (r5r20High || r5r20RatioHigh) return "Obstrucción periférica.";
  return "Patrón de oscilometría anormal no clasificado.";
}

function oscillometryPatternKeyFromText(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("normal")) return "normal";
  if (value.includes("perif")) return "peripheral";
  if (value.includes("central")) return "central";
  if (value.includes("restric")) return "restriction";
  if (value.includes("insuficientes") || value.includes("sin valores")) return "insufficient";
  return "unclassified";
}

function oscillometryBdText(r5Change, x5Change, axChange) {
  const responders = [];
  if (R.isFiniteNumber(r5Change) && r5Change <= -40) responders.push(`R5 ${fmt(r5Change, 1, "%")}`);
  if (R.isFiniteNumber(x5Change) && x5Change >= 50) responders.push(`X5 ${fmt(x5Change, 1, "%")}`);
  if (R.isFiniteNumber(axChange) && axChange <= -80) responders.push(`AX ${fmt(axChange, 1, "%")}`);
  if (responders.length) return `Respuesta a broncodilatador positiva (${responders.join(", ")}).`;
  const reported = [
    R.isFiniteNumber(r5Change) ? `R5 ${fmt(r5Change, 1, "%")}` : "",
    R.isFiniteNumber(x5Change) ? `X5 ${fmt(x5Change, 1, "%")}` : "",
    R.isFiniteNumber(axChange) ? `AX ${fmt(axChange, 1, "%")}` : ""
  ].filter(Boolean);
  return `Respuesta a broncodilatador negativa${reported.length ? ` (${reported.join(", ")})` : ""}.`;
}

function reactancePercentImprovement(pre, post) {
  if (!R.isFiniteNumber(pre) || !R.isFiniteNumber(post) || pre === 0) return null;
  return ((post - pre) / Math.abs(pre)) * 100;
}

function oscillometryState(z, direction, observed) {
  if (!R.isFiniteNumber(observed)) return "missing";
  if (!R.isFiniteNumber(z)) return "unknown";
  if (direction === "low") return z <= -1.645 ? "low" : "normal";
  return z >= 1.645 ? "high" : "normal";
}

function calculateSpirometry() {
  const mode = currentSpirometryMode();
  const hasBd = mode === "bd";
  const fev1Pre = numberValue("fev1Pre");
  const fev1Post = hasBd ? numberValue("fev1Post") : null;
  const fvcPre = numberValue("fvcPre");
  const fvcPost = hasBd ? numberValue("fvcPost") : null;
  const age = numberValue("age");
  const height = numberValue("height");
  const sex = $("sex").value;
  const ratioPre = R.isFiniteNumber(fev1Pre) && R.isFiniteNumber(fvcPre) && fvcPre !== 0 ? (fev1Pre / fvcPre) * 100 : null;
  const ratioPost = R.isFiniteNumber(fev1Post) && R.isFiniteNumber(fvcPost) && fvcPost !== 0 ? (fev1Post / fvcPost) * 100 : null;
  const withObserved = (ref, observed) => ref ? { ...ref, observed } : null;
  const fev1PreRef = withObserved(R.spirometryReference("fev1", sex, age, height, fev1Pre), fev1Pre);
  const fev1PostRef = hasBd ? withObserved(R.spirometryReference("fev1", sex, age, height, fev1Post), fev1Post) : null;
  const fvcPreRef = withObserved(R.spirometryReference("fvc", sex, age, height, fvcPre), fvcPre);
  const fvcPostRef = hasBd ? withObserved(R.spirometryReference("fvc", sex, age, height, fvcPost), fvcPost) : null;
  const ratioPreRef = withObserved(R.spirometryReference("ratio", sex, age, height, ratioPre), ratioPre);
  const ratioPostRef = hasBd ? withObserved(R.spirometryReference("ratio", sex, age, height, ratioPost), ratioPost) : null;
  const fev1EquationRef = R.spirometryReference("fev1", sex, age, height, null);
  const fvcEquationRef = R.spirometryReference("fvc", sex, age, height, null);
  const ratioEquationRef = R.spirometryReference("ratio", sex, age, height, null);
  const fev1Pred = fev1EquationRef?.predicted ?? null;
  const fvcPred = fvcEquationRef?.predicted ?? null;
  const ratioPred = ratioEquationRef?.predicted ?? null;
  const ratioLln = ratioEquationRef?.lln ?? null;
  const fev1Z = fev1PreRef?.z ?? null;
  const fvcZ = fvcPreRef?.z ?? null;
  const findings = [];

  setNumber("ratioPre", ratioPre, 2);
  setNumber("ratioPost", ratioPost, 2);
  setNumber("fev1Pred", fev1Pred, 2);
  setNumber("fvcPred", fvcPred, 2);
  setNumber("ratioPred", ratioPred, 2);
  setNumber("ratioLln", ratioLln, 2);
  setNumber("fev1Z", fev1Z, 2);
  setNumber("fvcZ", fvcZ, 2);

  const fev1PctPre = R.percent(fev1Pre, fev1Pred);
  const fev1PctPost = R.percent(fev1Post, fev1Pred);
  const fvcPctPre = R.percent(fvcPre, fvcPred);
  const fvcPctPost = R.percent(fvcPost, fvcPred);
  const ratioPctPre = R.percent(ratioPre, ratioPred);
  const ratioPctPost = R.percent(ratioPost, ratioPred);
  const fev1Bd = R.percentChange(fev1Pre, fev1Post);
  const fvcBd = R.percentChange(fvcPre, fvcPost);
  const bdResponses = [
    bdParameterResponse("FEV1", fev1Pre, fev1Post, fev1PreRef?.z, fev1PostRef?.z),
    bdParameterResponse("FVC", fvcPre, fvcPost, fvcPreRef?.z, fvcPostRef?.z)
  ];
  const bdResponseByLabel = Object.fromEntries(bdResponses.filter(Boolean).map((item) => [item.label, item.positive]));
  const bdText = spirometryBdText(bdResponses);
  const bdPositive = bdResponses.some((item) => item?.positive);
  const basalPattern = spirometryPattern(ratioPreRef, fvcPreRef, fev1PreRef);
  const postPattern = hasBd ? spirometryPattern(ratioPostRef, fvcPostRef, fev1PostRef) : "";
  const basalPatternKey = spirometryPatternKey(ratioPreRef, fvcPreRef, fev1PreRef);
  const postPatternKey = hasBd ? spirometryPatternKey(ratioPostRef, fvcPostRef, fev1PostRef) : "";
  const qualityValue = $("spiroQuality")?.value || "acceptable";
  const interpretedBasalPattern = qualityValue === "uninterpretable"
    ? "no interpretable por calidad del estudio"
    : basalPattern;
  const interpretedPostPattern = qualityValue === "uninterpretable"
    ? "no interpretable por calidad del estudio"
    : postPattern;
  const simpleInterpretation = spirometrySentence("simple", interpretedBasalPattern);
  const basalInterpretation = spirometrySentence("basal", interpretedBasalPattern);
  const postInterpretation = spirometrySentence("post", interpretedPostPattern);
  const basalBad = spirometryLow(ratioPreRef) || spirometryLow(fvcPreRef) || spirometryLow(fev1PreRef);
  const postBad = hasBd && (spirometryLow(ratioPostRef) || spirometryLow(fvcPostRef) || spirometryLow(fev1PostRef));

  addFinding(findings, hasBd ? basalInterpretation : simpleInterpretation, qualityValue === "uninterpretable" ? "bad" : basalBad ? "bad" : "good");
  if (hasBd) addFinding(findings, bdText, bdPositive ? "good" : "warn");
  if (hasBd) addFinding(findings, postInterpretation, qualityValue === "uninterpretable" ? "bad" : postBad ? "bad" : "good");

  const simpleRows = [
    row("FVC", [fmt(fvcPred, 2), fmt(fvcEquationRef?.lln, 2), fmt(fvcPre, 2), fmt(fvcPctPre, 0), zCell(fvcPreRef?.z, spirometryLow(fvcPreRef))]),
    row("FEV1", [fmt(fev1Pred, 2), fmt(fev1EquationRef?.lln, 2), fmt(fev1Pre, 2), fmt(fev1PctPre, 0), zCell(fev1PreRef?.z, spirometryLow(fev1PreRef))]),
    row("FEV1/FVC", [fmt(ratioPred, 2), fmt(ratioLln, 2), fmt(ratioPre, 2), fmt(ratioPctPre, 0), zCell(ratioPreRef?.z, spirometryLow(ratioPreRef))])
  ];
  const bdRows = [
    row("FVC", [fmt(fvcPred, 2), fmt(fvcEquationRef?.lln, 2), fmt(fvcPre, 2), fmt(fvcPctPre, 0), zCell(fvcPreRef?.z, spirometryLow(fvcPreRef)), fmt(fvcPost, 2), fmt(fvcPctPost, 0), zCell(fvcPostRef?.z, spirometryLow(fvcPostRef)), bdCell(fvcBd, bdResponseByLabel.FVC)]),
    row("FEV1", [fmt(fev1Pred, 2), fmt(fev1EquationRef?.lln, 2), fmt(fev1Pre, 2), fmt(fev1PctPre, 0), zCell(fev1PreRef?.z, spirometryLow(fev1PreRef)), fmt(fev1Post, 2), fmt(fev1PctPost, 0), zCell(fev1PostRef?.z, spirometryLow(fev1PostRef)), bdCell(fev1Bd, bdResponseByLabel.FEV1)]),
    row("FEV1/FVC", [fmt(ratioPred, 2), fmt(ratioLln, 2), fmt(ratioPre, 2), fmt(ratioPctPre, 0), zCell(ratioPreRef?.z, spirometryLow(ratioPreRef)), fmt(ratioPost, 2), fmt(ratioPctPost, 0), zCell(ratioPostRef?.z, spirometryLow(ratioPostRef)), fmt(R.percentChange(ratioPre, ratioPost), 1)])
  ];
  const rows = (hasBd ? bdRows : simpleRows).filter((line) => !line.includes("<td></td><td></td><td></td><td></td><td></td>"));
  const interpretationSections = hasBd
    ? [
        section("Basal", basalInterpretation),
        section("Broncodilatador", bdText),
        section("Postbroncodilatador", postInterpretation)
      ]
    : [section("Interpretación", simpleInterpretation)];

  return {
    study: "spirometry",
    findings,
    interpretation: {
      title: spirometryLabel(),
      sections: interpretationSections
    },
    summary: {
      basalPatternKey,
      postPatternKey,
      hasBd,
      bdPositive,
      obstruction: basalPatternKey === "obstruction" || basalPatternKey === "mixed" || postPatternKey === "obstruction" || postPatternKey === "mixed",
      possibleRestriction: basalPatternKey === "restriction" || basalPatternKey === "mixed" || postPatternKey === "restriction" || postPatternKey === "mixed",
      mixed: basalPatternKey === "mixed" || postPatternKey === "mixed",
      normal: basalPatternKey === "normal" && (!hasBd || postPatternKey === "normal")
    },
    algorithm: {
      html: spirometryAlgorithmHtml([...new Set([basalPatternKey, postPatternKey].filter(Boolean))], hasBd)
    },
    references: [referenceLabels.spirometry, "Stanojevic S, Kaminsky DA, Miller MR, et al. ERS/ATS technical standard on interpretive strategies for routine lung function tests. Eur Respir J 2022;60:2101499."],
    html: table(spirometryLabel(), hasBd ? ["Parámetro", "Pred", "LIN", "Pre", "% pred", "Z", "Post", "% pred", "Z", "% cambio"] : ["Parámetro", "Pred", "LIN", "Pre", "% pred", "Z"], rows)
  };
}

function calculateOscillometry() {
  const r5Pre = numberValue("r5Pre");
  const r5Post = numberValue("r5Post");
  const r20Pre = numberValue("r20Pre");
  const r20Post = numberValue("r20Post");
  const r5r20Pre = R.isFiniteNumber(r5Pre) && R.isFiniteNumber(r20Pre) ? r5Pre - r20Pre : null;
  const r5r20Post = R.isFiniteNumber(r5Post) && R.isFiniteNumber(r20Post) ? r5Post - r20Post : null;
  const r5r20RatioPre = R.isFiniteNumber(r5r20Pre) && R.isFiniteNumber(r5Pre) && r5Pre !== 0 ? r5r20Pre / r5Pre : null;
  const r5r20RatioPost = R.isFiniteNumber(r5r20Post) && R.isFiniteNumber(r5Post) && r5Post !== 0 ? r5r20Post / r5Post : null;
  setNumber("r5r20Pre", r5r20Pre, 2);
  setNumber("r5r20Post", r5r20Post, 2);
  setNumber("r5r20RatioPre", r5r20RatioPre, 2);
  setNumber("r5r20RatioPost", r5r20RatioPost, 2);

  const specs = [
    ["R5", "r5Pre", "r5Post", "r5Uln", "r5Z", "high", "R5"],
    ["R20", "r20Pre", "r20Post", "r20Uln", "r20Z", "high", "R20"],
    ["R5-R20", "r5r20Pre", "r5r20Post", "r5r20Uln", "r5r20Z", "high", "R5-R20"],
    ["(R5-R20)/R5", "r5r20RatioPre", "r5r20RatioPost", "r5r20RatioUln", "r5r20RatioZ", "high", "R5-R20/R5"],
    ["X5", "x5Pre", "x5Post", "x5Lln", "x5Z", "low", "X5"],
    ["AX", "axPre", "axPost", "axUln", "axZ", "high", "AX"],
    ["Fres", "fresPre", "fresPost", "fresUln", "fresZ", "high", "Fres"]
  ];
  const findings = [];
  const values = [];
  const rows = specs.map(([label, preId, postId, limitId, zId, direction, refName]) => {
    const pre = numberValue(preId);
    const post = numberValue(postId);
    const preRef = R.oscillometryReference(refName, $("sex").value, numberValue("age"), numberValue("height"), numberValue("weight"), pre);
    const postRef = R.oscillometryReference(refName, $("sex").value, numberValue("age"), numberValue("height"), numberValue("weight"), post);
    const ref = postRef || preRef;
    const limit = direction === "high" ? ref?.uln ?? numberValue(limitId) : ref?.lln ?? numberValue(limitId);
    const z = postRef?.z ?? preRef?.z ?? numberValue(zId);
    const change = label === "X5" ? reactancePercentImprovement(pre, post) : R.percentChange(pre, post);
    const preZAbnormal = direction === "high" ? R.zIsHigh(preRef?.z) : R.zIsLow(preRef?.z);
    const postZAbnormal = direction === "high" ? R.zIsHigh(postRef?.z) : R.zIsLow(postRef?.z);
    const bdResponder = (label === "R5" && R.isFiniteNumber(change) && change <= -40)
      || (label === "X5" && R.isFiniteNumber(change) && change >= 50)
      || (label === "AX" && R.isFiniteNumber(change) && change <= -80);
    setNumber(limitId, limit, 2);
    setNumber(zId, z, 2);
    const abnormalByLimit = R.isFiniteNumber(pre) && R.isFiniteNumber(limit) && (direction === "high" ? pre > limit : pre < limit);
    const abnormalByZ = preZAbnormal;
    if (abnormalByLimit || abnormalByZ) addFinding(findings, `${label} fuera de rango de referencia.`, "bad");
    values.push({
      label,
      observed: pre,
      preZ: preRef?.z,
      postZ: postRef?.z,
      state: oscillometryState(preRef?.z, direction, pre),
      postState: oscillometryState(postRef?.z, direction, post)
    });
    return row(label, [
      fmt(ref?.predicted, 2),
      fmt(ref?.lln, 2),
      fmt(ref?.uln, 2),
      fmt(pre, 2),
      fmt(R.percent(pre, ref?.predicted), 0),
      zCell(preRef?.z, preZAbnormal),
      fmt(post, 2),
      fmt(R.percent(post, ref?.predicted), 0),
      zCell(postRef?.z, postZAbnormal),
      bdCell(change, bdResponder)
    ]);
  });
  const r5Change = R.percentChange(numberValue("r5Pre"), numberValue("r5Post"));
  const x5Change = reactancePercentImprovement(numberValue("x5Pre"), numberValue("x5Post"));
  const axChange = R.percentChange(numberValue("axPre"), numberValue("axPost"));
  const osciBdPositive = (R.isFiniteNumber(r5Change) && r5Change <= -40) || (R.isFiniteNumber(x5Change) && x5Change >= 50) || (R.isFiniteNumber(axChange) && axChange <= -80);
  addFinding(findings, oscillometryBdText(r5Change, x5Change, axChange), osciBdPositive ? "good" : "warn");
  const postValues = values.map((item) => ({
    ...item,
    observed: numberValue(specs.find((spec) => spec[0] === item.label)?.[2] || ""),
    state: item.postState
  }));
  const basalPattern = oscillometryPattern(values);
  const postPattern = oscillometryPattern(postValues).replace("basal", "post broncodilatador");
  return {
    study: "oscillometry",
    findings,
    interpretation: {
      title: "Oscilometría con broncodilatador",
      sections: [
        section("Basal", basalPattern),
        section("Broncodilatador", oscillometryBdText(r5Change, x5Change, axChange)),
        section("Post broncodilatador", postPattern)
      ]
    },
    summary: {
      basalPatternKey: oscillometryPatternKeyFromText(basalPattern),
      postPatternKey: oscillometryPatternKeyFromText(postPattern),
      bdPositive: osciBdPositive,
      peripheral: [basalPattern, postPattern].some((text) => /perif/i.test(text)),
      central: [basalPattern, postPattern].some((text) => /central/i.test(text)),
      possibleRestriction: [basalPattern, postPattern].some((text) => /restric/i.test(text)),
      normal: [basalPattern, postPattern].every((text) => /normal/i.test(text))
    },
    algorithm: {
      html: oscillometryAlgorithmHtml([...new Set([oscillometryPatternKeyFromText(basalPattern), oscillometryPatternKeyFromText(postPattern)])])
    },
    references: [referenceLabels.oscillometry, "King GG et al. Technical standards for respiratory oscillometry. Eur Respir J 2020;55:1900753."],
    html: table("Oscilometría con broncodilatador", ["Parámetro", "Pred", "LIN", "LSN", "Pre", "% pred", "Z pre", "Post", "% pred", "Z post", "% cambio"], rows)
  };
}

function calculateFeno() {
  const value = numberValue("fenoValue");
  const group = $("fenoAgeGroup").value;
  const ics = $("icsUse").value;
  const hasPrevious = $("hasPreviousFeno").checked;
  const previousValue = numberValue("previousFenoValue");
  const previousDate = textValue("previousFenoDate");
  const findings = [];
  let categoryText = "";
  let categoryKey = "insufficient";
  if (R.isFiniteNumber(value)) {
    const low = group === "child" ? 20 : 25;
    const high = group === "child" ? 35 : 50;
    if (value < low) {
      categoryText = "Valor normal de inflamacion eosinofilica de la via aerea.";
      categoryKey = "normal";
    } else if (value <= high) {
      categoryText = "Valor intermedio de inflamacion eosinofilica de la via aerea.";
      categoryKey = "intermediate";
    } else {
      categoryText = "Valor alto de inflamacion eosinofilica de la via aerea.";
      categoryKey = "high";
    }
    addFinding(findings, categoryText, value > high ? "bad" : value >= low ? "warn" : "good");
    if (hasPrevious && R.isFiniteNumber(previousValue)) {
      const delta = value - previousValue;
      const percentDelta = previousValue !== 0 ? (delta / previousValue) * 100 : null;
      const significantIncrease = previousValue > 50 ? percentDelta >= 20 : delta > 10;
      const significantDecrease = previousValue > 50 ? percentDelta <= -20 : delta < -10;
      if (significantIncrease) addFinding(findings, "Aumento significativo en FeNO respecto al estudio previo.", "bad");
      else if (significantDecrease) addFinding(findings, "Respuesta significativa a terapia antiinflamatoria por reducción de FeNO respecto al estudio previo.", "good");
      else addFinding(findings, "Sin cambio significativo de FeNO respecto al estudio previo.", "warn");
    }
  }
  const rows = R.isFiniteNumber(value) ? [
    row("FeNO actual", [`${value} ppb`, group === "child" ? "Niño" : "Adulto", ics || "No especificado"]),
    ...(hasPrevious && R.isFiniteNumber(previousValue) ? [row("FeNO previo", [`${previousValue} ppb`, previousDate || "", ""])] : [])
  ] : [];
  return {
    study: "feno",
    findings,
    interpretation: {
      title: "FeNO",
      sections: [section("Resultado", findings.map((finding) => finding.text).join(" ") || "Sin datos suficientes para interpretar FeNO.")]
    },
    summary: {
      categoryKey,
      high: categoryKey === "high",
      intermediate: categoryKey === "intermediate",
      normal: categoryKey === "normal"
    },
    algorithm: {
      html: simpleAlgorithmHtml("FeNO", "Clasificación ATS por puntos de corte de inflamación eosinofílica de la vía aérea.", [
        { key: "normal", title: "Normal", detail: group === "child" ? "<20 ppb|en niños" : "<25 ppb|en adultos" },
        { key: "intermediate", title: "Intermedio", detail: group === "child" ? "20-35 ppb|en niños" : "25-50 ppb|en adultos" },
        { key: "high", title: "Alto", detail: group === "child" ? ">35 ppb|en niños" : ">50 ppb|en adultos" },
        { key: "insufficient", title: "No interpretable", detail: "Sin valor FeNO" }
      ], categoryKey)
    },
    references: ["Dweik RA, Boggs PB, Erzurum SC, Irvin CG, Leigh MW, Lundberg JO, et al. An official ATS clinical practice guideline: interpretation of exhaled nitric oxide levels (FENO) for clinical applications. Am J Respir Crit Care Med. 2011;184(5):602-15."],
    html: table("FeNO", ["Parámetro", "Valor", "Grupo", "Corticoide inhalado"], rows)
  };
}

function calculatePeakflow() {
  const actual = numberValue("pefActual");
  const ref = R.pefReference("mechanical", $("sex").value, numberValue("age"), numberValue("height"), numberValue("weight"), actual);
  const pred = ref?.predicted ?? numberValue("pefPred");
  const best = numberValue("pefBest");
  const max = numberValue("pefMax");
  const min = numberValue("pefMin");
  const base = best ?? pred;
  const pct = R.percent(actual, base);
  const variability = R.isFiniteNumber(max) && R.isFiniteNumber(min) && (max + min) !== 0 ? ((max - min) / ((max + min) / 2)) * 100 : null;
  const findings = [];
  let pefKey = "insufficient";
  setNumber("pefPred", pred, 0);
  if (R.isFiniteNumber(pct)) {
    if (pct >= 80) {
      pefKey = "green";
      addFinding(findings, "PEF en zona verde: al menos 80% del mejor personal o predicho.", "good");
    } else if (pct >= 50) {
      pefKey = "yellow";
      addFinding(findings, "PEF en zona amarilla: 50-79% del mejor personal o predicho.", "warn");
    } else {
      pefKey = "red";
      addFinding(findings, "PEF en zona roja: menor de 50% del mejor personal o predicho.", "bad");
    }
  }
  if (R.isFiniteNumber(variability)) {
    addFinding(findings, variability > 20 ? "Variabilidad diaria de PEF elevada." : "Variabilidad diaria de PEF no elevada por umbral de 20%.", variability > 20 ? "bad" : "good");
  }
  const rows = [
    row("PEF actual", [fmt(actual, 0, " L/min"), fmt(pred, 0, " L/min"), fmt(ref?.lln, 0, " L/min"), zCell(ref?.z, R.zIsLow(ref?.z)), fmt(base, 0, " L/min"), fmt(pct, 0, "%")]),
    row("Variabilidad diaria", [fmt(max, 0), "", "", "", fmt(min, 0), fmt(variability, 1, "%")])
  ];
  return {
    study: "peakflow",
    findings,
    interpretation: {
      title: "Flujometría",
      sections: [section("Resultado", findings.map((finding) => finding.text).join(" ") || "Sin datos suficientes para interpretar flujometría.")]
    },
    summary: {
      zone: pefKey,
      low: pefKey === "yellow" || pefKey === "red"
    },
    algorithm: {
      html: simpleAlgorithmHtml("Flujometría", "Clasificación por porcentaje del mejor personal o del predicho.", [
        { key: "green", title: "Zona verde", detail: "PEF >=80%" },
        { key: "yellow", title: "Zona amarilla", detail: "PEF 50-79%" },
        { key: "red", title: "Zona roja", detail: "PEF <50%" },
        { key: "insufficient", title: "No interpretable", detail: "Sin PEF|o base" }
      ], pefKey)
    },
    references: [referenceLabels.peakflow],
    html: table("Flujometría", ["Parámetro", "Valor", "Pred", "LIN", "Z", "Base", "Resultado"], rows)
  };
}

function dlcoState(ref, direction = "low") {
  if (!ref || !R.isFiniteNumber(ref.z)) return "";
  if (direction === "high") return R.zIsHigh(ref.z) ? "alto" : "normal";
  return R.zIsLow(ref.z) ? "disminuido" : "normal";
}

function severityAdverb(severity) {
  return {
    leve: "levemente",
    moderado: "moderadamente",
    grave: "gravemente"
  }[severity] || "";
}

function diffusionStatus(ref, lowWord, highWord) {
  if (!ref || !R.isFiniteNumber(ref.z)) return "sin datos suficientes para clasificar";
  if (R.zIsLow(ref.z)) return `${severityAdverb(zSeverity(ref.z))} ${lowWord}`.trim();
  if (R.zIsHigh(ref.z)) return `${severityAdverb(highZSeverity(ref.z))} ${highWord}`.trim();
  return "normal";
}

function dlcoInterpretationText(dlcoRef, vaRef, kcoRef, source, missingHb) {
  if (missingHb) return "DLCO sin valores de referencia calculables: ingrese hemoglobina para aplicar la corrección por hemoglobina y altitud.";
  if (!dlcoRef || !R.isFiniteNumber(dlcoRef.z)) return "DLCO sin datos suficientes para interpretar.";
  const dlcoStatus = diffusionStatus(dlcoRef, "disminuida", "elevada");
  const vaStatus = diffusionStatus(vaRef, "disminuido", "elevado");
  const details = [];
  if (kcoRef && R.isFiniteNumber(kcoRef.z)) details.push(`KCO está ${diffusionStatus(kcoRef, "disminuido", "elevado")}`);
  return `La difusión pulmonar de monóxido de carbono está ${dlcoStatus} y el volumen alveolar está ${vaStatus}${details.length ? `; ${details.join(", ")}` : ""}.`;
}

function lungVolumeInterpretation(tlc, rv, tlcRef, rvRef, source) {
  const hasTlc = R.isFiniteNumber(tlc);
  const hasRv = R.isFiniteNumber(rv);
  const rvTlc = hasTlc && hasRv && tlc > 0 ? (rv / tlc) * 100 : null;
  if (!hasTlc && !hasRv) return { text: "", key: "", rvTlc };
  if (source !== "pediatric" || ((hasTlc && !tlcRef) || (hasRv && !rvRef))) {
    return {
      text: "Volúmenes pulmonares ingresados sin ecuación de referencia cargada para clasificarlos en esta edad/fuente.",
      key: "not-classified",
      rvTlc
    };
  }

  const tlcLow = hasTlc && R.zIsLow(tlcRef?.z);
  const tlcHigh = hasTlc && R.zIsHigh(tlcRef?.z);
  const rvHigh = hasRv && R.zIsHigh(rvRef?.z);
  const rvLow = hasRv && R.zIsLow(rvRef?.z);
  const tlcLowSeverity = zSeverity(tlcRef?.z);
  const tlcHighSeverity = highZSeverity(tlcRef?.z);
  const rvHighSeverity = highZSeverity(rvRef?.z);
  const rvLowSeverity = zSeverity(rvRef?.z);
  const severityText = (severity) => severity ? ` ${severity}` : "";

  if (tlcLow) {
    return {
      text: `Volúmenes pulmonares compatibles con restricción${severityText(tlcLowSeverity)} por TLC reducida${rvHigh ? ` con RV elevada${severityText(rvHighSeverity)} asociada` : ""}.`,
      key: "restriction",
      severity: tlcLowSeverity,
      rvTlc
    };
  }
  if (tlcHigh && rvHigh) return { text: `Volúmenes pulmonares con hiperinflación${severityText(tlcHighSeverity)} y atrapamiento aéreo${severityText(rvHighSeverity)} por TLC y RV elevadas.`, key: "hyperinflation-trapping", severity: tlcHighSeverity || rvHighSeverity, rvTlc };
  if (tlcHigh) return { text: `Volúmenes pulmonares con hiperinflación${severityText(tlcHighSeverity)} por TLC elevada.`, key: "hyperinflation", severity: tlcHighSeverity, rvTlc };
  if (rvHigh) return { text: `Volúmenes pulmonares con atrapamiento aéreo${severityText(rvHighSeverity)} por RV elevada con TLC no reducida.`, key: "air-trapping", severity: rvHighSeverity, rvTlc };
  if (rvLow && !hasTlc) return { text: `RV reducida${severityText(rvLowSeverity)}; interprete en conjunto con TLC si está disponible.`, key: "rv-low", severity: rvLowSeverity, rvTlc };
  return { text: "Volúmenes pulmonares dentro de límites normales.", key: "normal", severity: "", rvTlc };
}

function calculateDlco() {
  const age = numberValue("age");
  const sex = $("sex").value;
  const height = numberValue("height");
  const weight = numberValue("weight");
  const dlco = numberValue("dlcoValue");
  const va = numberValue("dlcoVa");
  const kcoEntered = numberValue("dlcoKco");
  const kcoCalculated = R.isFiniteNumber(dlco) && R.isFiniteNumber(va) && va !== 0 ? dlco / va : null;
  const kco = kcoCalculated ?? kcoEntered;
  const tlc = numberValue("dlcoTlc");
  const rv = numberValue("dlcoRv");
  const hb = numberValue("dlcoHb");
  const altitude = numberValue("dlcoAltitude") ?? 2.24;
  const source = R.isFiniteNumber(age) && age >= 4 && age <= 20 ? "pediatric" : R.isFiniteNumber(age) && age > 20 ? "adult" : "";
  const missingHb = source === "adult" && !R.isFiniteNumber(hb);
  const findings = [];

  if (R.isFiniteNumber(kcoCalculated)) setNumber("dlcoKco", kcoCalculated, 2);

  const makeRef = (parameter, observed) => R.dlcoReference(parameter, sex, age, height, weight, observed, hb, altitude);
  const dlcoRef = makeRef("dlco", dlco);
  const vaRef = makeRef("va", va);
  const kcoRef = source === "adult" ? makeRef("kco", kco) : null;
  const tlcRef = source === "pediatric" ? makeRef("tlc", tlc) : null;
  const rvRef = source === "pediatric" ? makeRef("rv", rv) : null;
  const interpretation = dlcoInterpretationText(dlcoRef, vaRef, kcoRef, source, missingHb);
  const volumeInterpretation = lungVolumeInterpretation(tlc, rv, tlcRef, rvRef, source);
  let dlcoKey = "insufficient";
  if (!missingHb && dlcoRef && R.isFiniteNumber(dlcoRef.z)) {
    if (R.zIsHigh(dlcoRef.z)) dlcoKey = "high";
    else if (!R.zIsLow(dlcoRef.z)) dlcoKey = "normal";
    else if (R.zIsLow(vaRef?.z)) dlcoKey = R.zIsHigh(kcoRef?.z) ? "low-va-high-kco" : "low-va-low-kco";
    else dlcoKey = "low-va-normal";
  }

  addFinding(findings, interpretation, R.zIsLow(dlcoRef?.z) || missingHb ? "warn" : "good");
  addFinding(findings, volumeInterpretation.text, volumeInterpretation.key && volumeInterpretation.key !== "normal" ? "warn" : "good");
  if (source === "pediatric" && R.isFiniteNumber(kco)) addFinding(findings, "KCO se calcula como DLCO/VA; las ecuaciones pediátricas cargadas no incluyen z-score independiente de KCO.", "warn");
  if (!source && R.isFiniteNumber(age)) addFinding(findings, "Edad fuera de los rangos cargados para DLCO: pediátrica 4-20 años y adulta mayor de 20 años.", "warn");

  const rowFor = (label, observed, ref, direction = "low") => row(label, [
    fmt(ref?.predicted, 2),
    fmt(ref?.lln, 2),
    fmt(ref?.uln, 2),
    fmt(observed, 2),
    fmt(R.percent(observed, ref?.predicted), 0),
    zCell(ref?.z, direction === "high" ? R.zIsHigh(ref?.z) : R.zIsLow(ref?.z))
  ]);
  const rows = [
    rowFor("DLCO", dlco, dlcoRef),
    rowFor("VA", va, vaRef),
    source === "adult" ? rowFor("KCO", kco, kcoRef) : row("KCO", ["", "", "", fmt(kco, 2), "", ""]),
    ...(R.isFiniteNumber(tlc) || source === "pediatric" ? [rowFor("TLC", tlc, tlcRef)] : []),
    ...(R.isFiniteNumber(rv) || source === "pediatric" ? [rowFor("RV", rv, rvRef, "high")] : []),
    ...(R.isFiniteNumber(volumeInterpretation.rvTlc) ? [row("RV/TLC", ["", "", "", fmt(volumeInterpretation.rvTlc, 1, "%"), "", ""])] : []),
    ...(source === "adult" ? [
      row("Hemoglobina", ["", "", "", fmt(hb, 1, " g/dL"), "", ""]),
      row("Altitud", ["", "", "", fmt(altitude, 2, " km"), "", ""])
    ] : [])
  ];

  return {
    study: "dlco",
    findings,
    interpretation: {
      title: "DLCO",
      sections: [
        section("Difusión", interpretation),
        ...(volumeInterpretation.text ? [section("Volúmenes pulmonares", volumeInterpretation.text)] : [])
      ]
    },
    summary: {
      dlcoKey,
      volumeKey: volumeInterpretation.key,
      volumeSeverity: volumeInterpretation.severity,
      dlcoLow: R.zIsLow(dlcoRef?.z),
      dlcoHigh: R.zIsHigh(dlcoRef?.z),
      dlcoNormal: dlcoKey === "normal",
      restriction: volumeInterpretation.key === "restriction",
      hyperinflation: volumeInterpretation.key === "hyperinflation" || volumeInterpretation.key === "hyperinflation-trapping",
      airTrapping: volumeInterpretation.key === "air-trapping" || volumeInterpretation.key === "hyperinflation-trapping",
      volumesNormal: volumeInterpretation.key === "normal"
    },
    algorithm: {
      html: dlcoAlgorithmHtml(dlcoKey, source)
    },
    references: source === "pediatric" ? [referenceLabels.dlcoPediatric] : source === "adult" ? [referenceLabels.dlcoAdult] : [referenceLabels.dlcoPediatric, referenceLabels.dlcoAdult],
    html: table("DLCO", ["Parámetro", "Pred", "LIN", "LSN", "Valor", "% pred", "Z"], rows)
  };
}

function gasVentilation(ph, paco2) {
  if (!R.isFiniteNumber(ph) || !R.isFiniteNumber(paco2)) return { text: "ventilación no valorable", expected: null };
  const expected = 30 + ((7.40 - ph) * 100);
  if (paco2 < expected - 5) return { text: "hiperventilación", expected };
  if (paco2 > expected + 5) return { text: "hipoventilación", expected };
  return { text: "normoventilación", expected };
}

function gasPhStatus(ph) {
  if (!R.isFiniteNumber(ph)) return "estado ácido-base no valorable";
  if (ph < 7.35) return "acidosis";
  if (ph > 7.45) return "alcalosis";
  return "pH dentro de limites normales";
}

function gasSbeInterpretation(sbe, paco2, city) {
  if (!R.isFiniteNumber(sbe) || !R.isFiniteNumber(paco2)) return { disorder: "trastorno ácido-base no valorable", compensation: "", refSbe: city === "cdmx" ? -3 : 0 };
  const refSbe = city === "cdmx" ? -3 : 0;
  const deltaSbe = sbe - refSbe;
  const deltaPaco2 = paco2 - 30;
  const near = (actual, expected, tolerance = 5) => Math.abs(actual - expected) <= tolerance;

  if (sbe < -5) {
    if (paco2 < 26) {
      const expectedSbe = refSbe - 4 * ((30 - paco2) / 10);
      if (near(sbe, expectedSbe, 2.5)) return { disorder: "alcalosis respiratoria crónica", compensation: "compensada", refSbe };
    }
    const expectedPaco2 = 30 + deltaSbe;
    return {
      disorder: "acidosis metabólica",
      compensation: near(paco2, expectedPaco2) ? "compensada" : "con compensacion inadecuada o trastorno mixto",
      refSbe
    };
  }

  if (sbe > -1) {
    if (paco2 > 36) {
      const expectedSbe = refSbe + 4 * ((paco2 - 30) / 10);
      if (near(sbe, expectedSbe, 2.5)) return { disorder: "acidosis respiratoria crónica", compensation: "compensada", refSbe };
    }
    const expectedPaco2 = 30 + 6 * deltaSbe;
    return {
      disorder: "alcalosis metabólica",
      compensation: near(paco2, expectedPaco2) ? "compensada" : "con compensacion inadecuada o trastorno mixto",
      refSbe
    };
  }

  if (paco2 > 36) return { disorder: "acidosis respiratoria aguda", compensation: "no compensada", refSbe };
  if (paco2 < 26) return { disorder: "alcalosis respiratoria aguda", compensation: "no compensada", refSbe };
  return { disorder: "sin trastorno metabólico por SBE", compensation: "", refSbe };
}

function gasOxygenation(pao2, paco2, age, city, sex) {
  if (!R.isFiniteNumber(pao2)) return { text: "oxigenacion no valorable", gradientText: "", gradient: null, expectedGradient: null };
  const manuscriptRef = city === "cdmx" ? R.bloodGasReference(age, sex, pao2, paco2) : null;
  const pao2Lln = manuscriptRef?.pao2Pred ? manuscriptRef.pao2Pred - (1.645 * 6) : null;
  let oxygenText = "normoxemia";
  if (city === "cdmx" && R.isFiniteNumber(pao2Lln)) {
    if (pao2 < 45) oxygenText = "hipoxemia grave";
    else if (pao2 < 55) oxygenText = "hipoxemia moderada";
    else if (pao2 < pao2Lln) oxygenText = "hipoxemia leve";
  } else {
    if (pao2 < 45) oxygenText = "hipoxemia grave";
    else if (pao2 < 55) oxygenText = "hipoxemia moderada";
    else if (pao2 < 60) oxygenText = "hipoxemia leve";
  }

  const alveolarConstant = city === "cdmx" ? 113 : 150;
  const gradient = R.isFiniteNumber(paco2) ? alveolarConstant - (paco2 / 0.8) - pao2 : null;
  const expectedGradient = R.isFiniteNumber(age) ? age / 3 : null;
  const gradientText = R.isFiniteNumber(gradient) && R.isFiniteNumber(expectedGradient)
    ? (gradient > expectedGradient ? "con gradiente A-a elevado" : "sin gradiente A-a elevado")
    : "";
  return { text: oxygenText, gradientText, gradient, expectedGradient, pao2Pred: manuscriptRef?.pao2Pred ?? null, pao2Lln };
}

function calculateBloodGas() {
  const ph = numberValue("ph");
  const paco2 = numberValue("paco2");
  const pao2 = numberValue("pao2");
  const hco3 = numberValue("hco3");
  const sao2 = numberValue("sao2");
  const baseExcess = numberValue("baseExcess");
  const fio2 = numberValue("fio2") ?? 21;
  const city = $("gasCity").value || "cdmx";
  const age = numberValue("age");
  const lactate = numberValue("lactate");
  const ref = R.bloodGasReference(numberValue("age"), $("sex").value, pao2, paco2);
  const findings = [];
  const ventilation = gasVentilation(ph, paco2);
  const phStatus = gasPhStatus(ph);
  const sbeStatus = gasSbeInterpretation(baseExcess, paco2, city);
  const oxygenation = gasOxygenation(pao2, paco2, age, city, $("sex").value);
  const fio2Text = fio2 === 21 ? "al aire ambiente" : `con FiO2 ${fmt(fio2, 0, "%")}`;
  const cityText = city === "cdmx" ? "Ciudad de México/2240 m" : "nivel del mar";
  const compensationText = sbeStatus.compensation ? ` ${sbeStatus.compensation}` : "";
  const oxygenConnector = oxygenation.text.startsWith("hipoxemia") ? "e" : "y";
  const gasSentence = `Gasometría arterial ${fio2Text} en ${cityText} con ${ventilation.text}, ${sbeStatus.disorder}${compensationText} ${oxygenConnector} ${oxygenation.text}${oxygenation.gradientText ? ` ${oxygenation.gradientText}` : ""}.`;
  const gasKey = sbeStatus.disorder.includes("metabólica")
    ? "metabolic"
    : sbeStatus.disorder.includes("respiratoria")
      ? "respiratory"
      : sbeStatus.disorder.includes("no valorable")
        ? "insufficient"
        : "normal";

  addFinding(findings, gasSentence, oxygenation.text.includes("hipoxemia") || sbeStatus.disorder.includes("acidosis") ? "warn" : "good");
  if (R.isFiniteNumber(lactate) && lactate > 2) addFinding(findings, "Lactato elevado.", "bad");

  const rows = [
    row("pH", [fmt(ph, 2), "7.35-7.45"]),
    row("PaCO2", [fmt(paco2, 1, " mmHg"), `Esperada ${fmt(ventilation.expected, 1, " mmHg")}; normal 26-36 si pH 7.40`]),
    row("PaO2", [fmt(pao2, 1, " mmHg"), city === "cdmx" ? `Manuscrito CDMX: esperado ${fmt(oxygenation.pao2Pred, 1, " mmHg")}; LIN ${fmt(oxygenation.pao2Lln, 1, " mmHg")}` : ">=60 mmHg"]),
    row("HCO3", [fmt(hco3, 1, " mmol/L"), "22-26"]),
    row("SaO2", [fmt(sao2, 1, "%"), ""]),
    row("SBE", [fmt(baseExcess, 1, " mEq/L"), city === "cdmx" ? "-3 +/- 2" : "0 +/- 2"]),
    row("FiO2", [fmt(fio2, 0, "%"), cityText]),
    row("Gradiente A-a", [fmt(oxygenation.gradient, 1, " mmHg"), `Esperado ${fmt(oxygenation.expectedGradient, 1, " mmHg")}`]),
    row("Lactato", [fmt(lactate, 1, " mmol/L"), "<=2"])
  ];
  return {
    study: "bloodgas",
    findings,
    interpretation: {
      title: "Gasometría arterial",
      sections: [section("Resultado", findings.map((finding) => finding.text).join(" ") || "Sin datos suficientes para interpretar gasometría.")]
    },
    summary: {
      gasKey,
      hypoxemia: oxygenation.text.includes("hipoxemia"),
      aaElevated: oxygenation.gradientText.includes("elevado"),
      acidBaseDisorder: gasKey === "metabolic" || gasKey === "respiratory"
    },
    algorithm: {
      html: simpleAlgorithmHtml("Gasometría arterial", "Enfoque SBE: primero estado ventilatorio por PaCO2, después pH/SBE para componente ácido-base y finalmente oxigenación.", [
        { key: "normal", title: "Sin trastorno", detail: "metabólico por SBE" },
        { key: "respiratory", title: "Trastorno", detail: "respiratorio" },
        { key: "metabolic", title: "Trastorno", detail: "metabólico" },
        { key: "insufficient", title: "No interpretable", detail: "Faltan datos" }
      ], gasKey)
    },
    references: [referenceLabels.bloodgas],
    html: table("Gasometría arterial", ["Parámetro", "Resultado", "Referencia"], rows)
  };
}

function ocrNumberList(line) {
  return String(line || "")
    .replace(/FEV1\/FVC|FEV1|FVC|R5-R20|R20|R5|X5|AX|Fres|DLCO\/VA|KCO|DLCO|TLC|RV|VA|Hb|Hemoglobina|Altitud|PaCO2|PaO2|HCO3|SaO2|SBE|FiO2|PEF|FeNO|pH|Lactato/gi, " ")
    .match(/-?\d+(?:[.,]\d+)?/g)
    ?.map((value) => Number(value.replace(",", ".")))
    .filter(Number.isFinite) || [];
}

function ocrLines(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .split(/\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findOcrLine(lines, matcher) {
  return lines.find((line) => matcher.test(line)) || "";
}

function setFieldValue(id, value) {
  const element = $(id);
  if (!element || !R.isFiniteNumber(value)) return false;
  element.value = String(R.round(value, 2));
  return true;
}

function applyPairFromLine(lines, matcher, preId, postId, reportPreIndex, reportPostIndex) {
  const line = findOcrLine(lines, matcher);
  const values = ocrNumberList(line);
  if (!values.length) return 0;
  const looksLikeReportRow = values.length > reportPostIndex;
  const pre = looksLikeReportRow ? values[reportPreIndex] : values[0];
  const post = looksLikeReportRow ? values[reportPostIndex] : values[1];
  let count = 0;
  if (setFieldValue(preId, pre)) count += 1;
  if (setFieldValue(postId, post)) count += 1;
  return count;
}

function applySingleFromLine(lines, matcher, fieldId, index = 0) {
  const line = findOcrLine(lines, matcher);
  const values = ocrNumberList(line);
  return setFieldValue(fieldId, values[index]) ? 1 : 0;
}

function applyPhotoText(study, text) {
  const lines = ocrLines(text);
  let count = 0;
  if (study === "spirometry") {
    count += applyPairFromLine(lines, /\bFVC\b/i, "fvcPre", "fvcPost", 2, 5);
    count += applyPairFromLine(lines, /\bFEV1\b(?!\s*\/)/i, "fev1Pre", "fev1Post", 2, 5);
  } else if (study === "oscillometry") {
    count += applyPairFromLine(lines, /\bR5\b(?!\s*-)/i, "r5Pre", "r5Post", 3, 6);
    count += applyPairFromLine(lines, /\bR20\b/i, "r20Pre", "r20Post", 3, 6);
    count += applyPairFromLine(lines, /\bX5\b/i, "x5Pre", "x5Post", 3, 6);
    count += applyPairFromLine(lines, /\bAX\b/i, "axPre", "axPost", 3, 6);
    count += applyPairFromLine(lines, /\bFres\b/i, "fresPre", "fresPost", 3, 6);
  } else if (study === "feno") {
    count += applySingleFromLine(lines, /\bFeNO\b|ppb/i, "fenoValue", 0);
  } else if (study === "peakflow") {
    count += applySingleFromLine(lines, /\bPEF\b|flujo/i, "pefActual", 0);
    count += applySingleFromLine(lines, /mejor/i, "pefBest", 0);
    count += applySingleFromLine(lines, /max/i, "pefMax", 0);
    count += applySingleFromLine(lines, /min/i, "pefMin", 0);
  } else if (study === "dlco") {
    count += applySingleFromLine(lines, /\bDLCO\b(?!\s*\/)|\bTLCO\b/i, "dlcoValue", 0);
    count += applySingleFromLine(lines, /\bVA\b/i, "dlcoVa", 0);
    count += applySingleFromLine(lines, /\bKCO\b|DLCO\s*\/\s*VA/i, "dlcoKco", 0);
    count += applySingleFromLine(lines, /\bTLC\b/i, "dlcoTlc", 0);
    count += applySingleFromLine(lines, /\bRV\b/i, "dlcoRv", 0);
    count += applySingleFromLine(lines, /\bHb\b|hemoglobina/i, "dlcoHb", 0);
    count += applySingleFromLine(lines, /altitud/i, "dlcoAltitude", 0);
  } else if (study === "bloodgas") {
    count += applySingleFromLine(lines, /\bpH\b/i, "ph", 0);
    count += applySingleFromLine(lines, /\bPaCO2\b/i, "paco2", 0);
    count += applySingleFromLine(lines, /\bPaO2\b/i, "pao2", 0);
    count += applySingleFromLine(lines, /\bHCO3\b/i, "hco3", 0);
    count += applySingleFromLine(lines, /\bSaO2\b/i, "sao2", 0);
    count += applySingleFromLine(lines, /\bSBE\b|base excess/i, "baseExcess", 0);
    count += applySingleFromLine(lines, /\bFiO2\b/i, "fio2", 0);
    count += applySingleFromLine(lines, /lactato/i, "lactate", 0);
  }
  render();
  return count;
}

function extractTextFromImage(file, container) {
  const status = container.querySelector(".photo-status");
  const textarea = container.querySelector(".photo-text");
  if (!file) return;
  if (!("TextDetector" in window)) {
    status.textContent = "OCR automático no disponible en este navegador. Puede usar Live Text/Google Lens y pegar el texto aquí.";
    return;
  }
  const img = new Image();
  img.onload = async () => {
    try {
      const detector = new TextDetector();
      const results = await detector.detect(img);
      textarea.value = results.map((item) => item.rawValue).join("\n");
      status.textContent = textarea.value ? "Texto detectado. Revise y presione Copiar valores a la prueba." : "No se detectó texto claro en la imagen.";
    } catch (error) {
      status.textContent = "No fue posible leer la imagen. Pegue texto reconocido por Live Text/Google Lens.";
    } finally {
      URL.revokeObjectURL(img.src);
    }
  };
  img.src = URL.createObjectURL(file);
}

function syncStudyVisibility() {
  const selected = selectedStudies();
  const currentActive = document.querySelector(".tab.active")?.dataset.tab;
  let nextActive = selected.includes(currentActive) ? currentActive : selected[0];

  qsa(".tab").forEach((tab) => {
    const visible = selected.includes(tab.dataset.tab);
    tab.hidden = !visible;
    tab.classList.toggle("active", visible && tab.dataset.tab === nextActive);
  });

  qsa(".test-panel").forEach((panel) => {
    const visible = selected.includes(panel.dataset.panel);
    panel.hidden = !visible;
    panel.classList.toggle("active", visible && panel.dataset.panel === nextActive);
  });

  let empty = document.querySelector(".empty-state");
  if (!selected.length) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Seleccione los estudios realizados para capturar resultados.";
      $("calculatorForm").prepend(empty);
    }
  } else if (empty) {
    empty.remove();
  }
}

function syncSpirometryModeVisibility() {
  const selected = selectedStudies().includes("spirometry");
  const mode = currentSpirometryMode();
  const simple = mode !== "bd";
  const options = $("spirometryModeOptions");
  if (options) options.hidden = !selected;
  const panel = document.querySelector('[data-panel="spirometry"]');
  if (panel) panel.classList.toggle("simple-mode", simple);
  const title = $("spirometryTitle");
  if (title) title.textContent = spirometryLabel();
  const tab = document.querySelector('.tab[data-tab="spirometry"]');
  if (tab) tab.textContent = spirometryLabel();
}

function syncFenoPreviousVisibility() {
  const visible = $("hasPreviousFeno")?.checked || false;
  qsa(".previous-feno-field").forEach((field) => {
    field.hidden = !visible;
  });
}

function currentInterpretationStates() {
  const states = {};
  qsa(".interpretation-card").forEach((card) => {
    const study = card.dataset.study;
    states[study] = {
      accepted: card.querySelector(".accept-interpretation")?.checked || false,
      manual: card.querySelector(".manual-interpretation")?.checked || false,
      text: card.querySelector("textarea")?.value || ""
    };
  });
  return states;
}

function renderInterpretationControls(calculators) {
  const states = currentInterpretationStates();
  $("interpretationControls").innerHTML = calculators.map((item) => {
    const state = states[item.study] || {};
    const generated = item.interpretation?.sections?.map((part) => `${part.title}: ${part.text}`).join("\n") || item.findings.map((finding) => finding.text).join("\n");
    return `
      <article class="interpretation-card" data-study="${item.study}">
        <header>
          <strong>${studyLabel(item.study)}</strong>
        </header>
        <label class="inline-check">
          <input class="accept-interpretation" type="checkbox" ${state.accepted ? "checked" : ""}>
          <span>Confirmo que la interpretación generada es correcta</span>
        </label>
        <label class="inline-check">
          <input class="manual-interpretation" type="checkbox" ${state.manual ? "checked" : ""}>
          <span>Usar interpretación manual en el reporte</span>
        </label>
        <textarea class="manual-text" rows="12" ${state.manual ? "" : "hidden"} placeholder="Interpretación manual de ${studyLabel(item.study)}">${cleanText(state.manual ? state.text : generated)}</textarea>
      </article>
    `;
  }).join("");

  qsa(".accept-interpretation, .manual-interpretation").forEach((input) => {
    input.addEventListener("change", render);
  });
  qsa(".manual-text").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const study = textarea.closest(".interpretation-card")?.dataset.study;
      const target = document.querySelector(`.report-interpretation[data-study="${study}"] .manual-report-text`);
      if (target) target.innerHTML = cleanText(textarea.value).replace(/\n/g, "<br>");
      syncPrintButtonState();
    });
  });
}

function renderInterpretation(item, states) {
  const state = states[item.study] || {};
  if (state.manual && state.text.trim()) {
    return `
      <article class="report-interpretation" data-study="${item.study}">
        <h4>${studyLabel(item.study)}</h4>
        <p class="manual-report-text">${cleanText(state.text).replace(/\n/g, "<br>")}</p>
      </article>
    `;
  }
  const sections = item.interpretation?.sections || item.findings.map((finding) => section("Resultado", finding.text));
  return `
    <article class="report-interpretation" data-study="${item.study}">
      <h4>${item.interpretation?.title || studyLabel(item.study)}</h4>
      ${sections.map((part) => `<p><strong>${part.title}:</strong> ${cleanText(part.text)}</p>`).join("")}
    </article>
  `;
}

function interpretationsReady() {
  const cards = qsa(".interpretation-card");
  if (!cards.length) return false;
  return cards.every((card) => {
    const accepted = card.querySelector(".accept-interpretation")?.checked || false;
    const manual = card.querySelector(".manual-interpretation")?.checked || false;
    const text = card.querySelector("textarea")?.value.trim() || "";
    return accepted || (manual && text);
  });
}

function syncPrintButtonState() {
  const button = $("printReport");
  if (!button) return;
  const ready = interpretationsReady();
  button.hidden = !ready;
  button.disabled = !ready;
}

async function sendRecordToNetlify(record) {
  const response = await fetch("/.netlify/functions/save-pfr-record", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(record)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || "No fue posible guardar en Google Sheets.");
  return data;
}

async function saveDatabaseRecord() {
  if (!lastReportContext) return null;
  const states = currentInterpretationStates();
  const record = {
    id: `pfr-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    patient: {
      name: textValue("patientName"),
      studyDate: textValue("studyDate"),
      birthDate: textValue("birthDate"),
      ageYears: textValue("age"),
      sex: $("sex").value,
      heightCm: textValue("height"),
      weightKg: textValue("weight")
    },
    selectedStudies: selectedStudies().map((study) => studyLabel(study)),
    rawInputs: rawInputData(),
    interpretations: lastReportContext.reviewItems.map((item) => {
      const state = states[item.study] || {};
      const generated = item.interpretation?.sections?.map((part) => ({ title: part.title, text: part.text })) || [];
      return {
        study: item.study,
        label: studyLabel(item.study),
        accepted: state.accepted,
        manual: state.manual,
        printedText: state.manual && state.text.trim() ? state.text.trim() : generated.map((part) => `${part.title}: ${part.text}`).join("\n"),
        generated
      };
    }),
    summaries: Object.fromEntries(lastReportContext.calculators.map((item) => [item.study, item.summary || {}])),
    references: lastReportContext.references,
    resultTables: tableDataFromReport()
  };
  const previous = JSON.parse(localStorage.getItem(DATABASE_KEY) || "[]");
  const records = [...previous, record];
  localStorage.setItem(DATABASE_KEY, JSON.stringify(records));
  await sendRecordToNetlify(record);
  return record;
}

function buildIntegratedInterpretation(calculators) {
  if (calculators.length < 2) return null;
  const byStudy = Object.fromEntries(calculators.map((item) => [item.study, item]));
  const spiro = byStudy.spirometry?.summary || {};
  const osci = byStudy.oscillometry?.summary || {};
  const feno = byStudy.feno?.summary || {};
  const pef = byStudy.peakflow?.summary || {};
  const dlco = byStudy.dlco?.summary || {};
  const gas = byStudy.bloodgas?.summary || {};
  const statements = [];

  const airwayEvidence = [];
  if (spiro.obstruction) airwayEvidence.push("espirometría");
  if (osci.peripheral || osci.central) airwayEvidence.push(osci.peripheral ? "oscilometría con compromiso periférico" : "oscilometría con compromiso central");
  if (pef.low) airwayEvidence.push("flujometría reducida");
  if (airwayEvidence.length) statements.push(`Conjunto compatible con alteración obstructiva de la vía aérea sustentada por ${airwayEvidence.join(", ")}.`);

  if (spiro.mixed && dlco.restriction) {
    statements.push("La reducción de FVC con relación FEV1/FVC baja y TLC reducida apoya un trastorno ventilatorio mixto.");
  } else if (spiro.possibleRestriction && dlco.restriction) {
    statements.push("La sospecha espirométrica de restricción queda apoyada por TLC reducida en volúmenes pulmonares.");
  } else if (spiro.possibleRestriction && dlco.volumesNormal) {
    statements.push("La FVC reducida no se acompaña de TLC reducida; no se confirma restricción con los volúmenes disponibles.");
  } else if (dlco.restriction) {
    statements.push("Los volúmenes pulmonares muestran patrón restrictivo por TLC reducida.");
  }

  if (dlco.hyperinflation || dlco.airTrapping) {
    statements.push(`Los volúmenes pulmonares ${dlco.hyperinflation ? "muestran hiperinflación" : "no muestran hiperinflación"}${dlco.airTrapping ? " con atrapamiento aéreo" : ""}, lo cual debe integrarse con la presencia o ausencia de obstrucción en espirometría/oscilometría.`);
  }

  if (dlco.dlcoLow && (gas.hypoxemia || gas.aaElevated)) {
    statements.push("La DLCO disminuida asociada a hipoxemia o gradiente A-a elevado sugiere alteración del intercambio gaseoso; correlacionar con hemoglobina, imagen y contexto clínico.");
  } else if (dlco.dlcoLow) {
    statements.push("DLCO disminuida; interpretar en conjunto con VA/KCO, hemoglobina y volúmenes pulmonares.");
  } else if (dlco.dlcoNormal && (spiro.obstruction || osci.peripheral || osci.central)) {
    statements.push("DLCO conservada en presencia de alteración obstructiva, sin evidencia funcional de alteración de difusión en los datos ingresados.");
  }

  if (feno.high) statements.push("FeNO alto, compatible con inflamación eosinofílica de la vía aérea y útil para integrar respuesta a terapia antiinflamatoria.");
  else if (feno.intermediate) statements.push("FeNO intermedio; integrar con síntomas, tratamiento antiinflamatorio y hallazgos obstructivos.");

  if (spiro.bdPositive || osci.bdPositive) {
    const sources = [spiro.bdPositive ? "espirometría" : "", osci.bdPositive ? "oscilometría" : ""].filter(Boolean).join(" y ");
    statements.push(`Respuesta a broncodilatador positiva por ${sources}.`);
  }

  if (gas.acidBaseDisorder) statements.push("La gasometría muestra alteración ácido-base que debe reportarse de forma independiente del patrón ventilatorio.");
  if (gas.hypoxemia && !dlco.dlcoLow) statements.push("Hipoxemia presente; considerar mecanismo ventilatorio, V/Q, shunt o gradiente A-a según el reporte gasométrico.");

  if (!statements.length) statements.push("En conjunto, las pruebas capturadas no muestran discordancias relevantes entre los apartados interpretados.");
  return {
    study: "integrated",
    findings: statements.map((text) => ({ text, tone: "good" })),
    interpretation: {
      title: "Interpretación integral",
      sections: [section("Resultado", statements.join(" "))]
    }
  };
}

function render() {
  calculateAge();
  syncFenoPreviousVisibility();
  syncStudyVisibility();
  syncSpirometryModeVisibility();
  const selected = selectedStudies();
  const completed = selected.filter(hasStudyData);
  const calculators = completed.map((study) => studies[study].calculate());
  const integratedItem = buildIntegratedInterpretation(calculators);
  const reviewItems = integratedItem ? [...calculators, integratedItem] : calculators;
  renderInterpretationControls(reviewItems);
  const interpretationStates = currentInterpretationStates();
  const findings = calculators.flatMap((item) => item.findings);
  const html = calculators.map((item) => item.html).join("");
  const algorithmHtml = calculators.map((item) => item.algorithm?.html || "").filter(Boolean).join("");
  const references = [...new Set(calculators.flatMap((item) => item.references || []))];
  const name = textValue("patientName") || "Paciente";
  const date = textValue("studyDate") || new Date().toISOString().slice(0, 10);
  const demographics = [
    textValue("birthDate") ? `FN: ${textValue("birthDate")}` : "",
    textValue("age") ? `Edad: ${textValue("age")} años` : "",
    $("sex").value ? ($("sex").value === "female" ? "mujer" : "hombre") : "",
    textValue("height") ? `${textValue("height")} cm` : "",
    textValue("weight") ? `${textValue("weight")} kg` : ""
  ].filter(Boolean).join(" | ");

  $("reportMeta").textContent = `${name} | ${date}${demographics ? ` | ${demographics}` : ""}`;
  $("selectedStudyLine").textContent = selected.length
    ? selected.map((study) => studyLabel(study)).join(" | ")
    : "Seleccione estudios para iniciar.";
  $("interpretationList").innerHTML = calculators.length
    ? calculators.map((item) => renderInterpretation(item, interpretationStates)).join("")
    : `<li>${selected.length ? "Ingrese resultados en los estudios seleccionados para generar la interpretación." : "Seleccione los estudios realizados para iniciar la captura."}</li>`;
  $("integratedInterpretation").innerHTML = integratedItem ? renderInterpretation(integratedItem, interpretationStates) : "";
  $("resultTables").innerHTML = html || `<p>${selected.length ? "No hay resultados capturados en los estudios seleccionados." : "No hay estudios seleccionados."}</p>`;
  $("algorithmList").innerHTML = algorithmHtml || `<p>${selected.length ? "Ingrese resultados para mostrar el algoritmo utilizado." : "Seleccione estudios para mostrar algoritmos."}</p>`;
  $("technicalNote").innerHTML = references.length
    ? references.map((reference) => cleanText(reference)).join("<br>")
    : "Las referencias apareceran al capturar resultados.";
  const pendingValidation = reviewItems.some((item) => {
    const state = interpretationStates[item.study] || {};
    return !state.accepted && !(state.manual && state.text.trim());
  });
  $("validationStatus").textContent = completed.length ? (pendingValidation ? "Pendiente de validar" : "Reporte validado") : selected.length ? "Pendiente de resultados" : "Seleccione estudios";
  lastReportContext = { calculators, reviewItems, references };
  syncPrintButtonState();
}

function setDemo() {
  const demo = {
    patientName: "Paciente de ejemplo", birthDate: "1984-06-16", sex: "female", height: "162", weight: "68",
    fev1Pre: "1.82", fev1Post: "2.18", fev1Pred: "2.75", fvcPre: "3.10", fvcPost: "3.25", fvcPred: "3.35", ratioPre: "0.587", ratioPost: "0.671", ratioPred: "82.00", ratioLln: "72.00", fev1Z: "-2.20",
    r5Pre: "0.62", r5Post: "0.48", r20Pre: "0.36", r20Post: "0.32", x5Pre: "-0.26", x5Post: "-0.17", axPre: "2.40", axPost: "1.10", fresPre: "23", fresPost: "17",
    fenoValue: "58", fenoAgeGroup: "adult", icsUse: "no", hasPreviousFeno: "on", previousFenoValue: "42", previousFenoDate: "2026-03-16", pefActual: "330", pefBest: "430", pefMax: "390", pefMin: "300",
    dlcoValue: "22.4", dlcoVa: "4.85", dlcoHb: "14.2", dlcoAltitude: "2.24",
    ph: "7.43", paco2: "31", pao2: "70", hco3: "20", sao2: "94", baseExcess: "-2.5", fio2: "21", gasCity: "cdmx", lactate: "1.2"
  };
  qsa(".study-check").forEach((input) => {
    input.checked = true;
  });
  const demoMode = document.querySelector('input[name="spirometryMode"][value="bd"]');
  if (demoMode) demoMode.checked = true;
  Object.entries(demo).forEach(([id, value]) => {
    if ($(id)?.type === "checkbox") $(id).checked = value === "on";
    else if ($(id)) $(id).value = value;
  });
  if (!$("studyDate").value) $("studyDate").value = new Date().toISOString().slice(0, 10);
  render();
}

function clearAll() {
  fields.forEach((id) => {
    if ($(id)?.type === "checkbox") $(id).checked = false;
    else if ($(id)) $(id).value = "";
  });
  qsa(".study-check").forEach((input) => {
    input.checked = false;
  });
  $("fenoAgeGroup").value = "adult";
  $("gasCity").value = "cdmx";
  $("dlcoAltitude").value = "2.24";
  const simpleMode = document.querySelector('input[name="spirometryMode"][value="simple"]');
  if (simpleMode) simpleMode.checked = true;
  render();
}

qsa(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    qsa(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    qsa(".test-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === button.dataset.tab));
  });
});

fields.forEach((id) => {
  if ($(id)) $(id).addEventListener("input", render);
});

qsa(".study-check").forEach((input) => {
  input.addEventListener("change", render);
});

qsa('input[name="spirometryMode"]').forEach((input) => {
  input.addEventListener("change", render);
});

qsa(".photo-input").forEach((input) => {
  input.addEventListener("change", () => {
    extractTextFromImage(input.files?.[0], input.closest(".photo-import"));
  });
});

qsa(".photo-apply").forEach((button) => {
  button.addEventListener("click", () => {
    const container = button.closest(".photo-import");
    const study = container?.dataset.photoStudy;
    const text = container?.querySelector(".photo-text")?.value || "";
    const count = applyPhotoText(study, text);
    const status = container?.querySelector(".photo-status");
    if (status) status.textContent = count ? `Se copiaron ${count} valores. Revise que coincidan con el reporte original.` : "No se identificaron valores suficientes. Pegue el texto con etiquetas como FEV1, FVC, R5, X5, DLCO, FeNO o PaO2.";
  });
});

$("loadDemo").addEventListener("click", setDemo);
$("clearAll").addEventListener("click", clearAll);
$("printReport").addEventListener("click", async () => {
  if (!interpretationsReady()) {
    syncPrintButtonState();
    return;
  }
  try {
    await saveDatabaseRecord();
  } catch (error) {
    console.warn("No fue posible enviar la base de datos a Google Sheets.", error);
  }
  window.print();
});

$("studyDate").value = new Date().toISOString().slice(0, 10);
$("gasCity").value = "cdmx";
$("dlcoAltitude").value = "2.24";
$("printReport").hidden = true;
$("printReport").disabled = true;
render();
