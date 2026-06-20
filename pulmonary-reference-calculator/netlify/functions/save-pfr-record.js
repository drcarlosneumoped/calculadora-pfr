const { google } = require("googleapis");

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://calculadorapfr.netlify.app",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Metodo no permitido." });
  }

  try {
    const record = JSON.parse(event.body || "{}");
    if (!record || typeof record !== "object" || !record.patient) {
      return json(400, { ok: false, error: "Registro invalido." });
    }

    const missingEnv = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEET_ID"]
      .filter((key) => !process.env[key]);

    if (missingEnv.length) {
      return json(500, {
        ok: false,
        error: `Faltan variables de entorno en Netlify: ${missingEnv.join(", ")}.`
      });
    }

    const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      scopes.push("https://www.googleapis.com/auth/drive.file");
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes
    });

    const sheets = google.sheets({ version: "v4", auth });
    const row = buildSheetRow(record);

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: process.env.GOOGLE_SHEET_RANGE || "Registros!A1",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] }
    });

    let driveFileId = "";
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
      const drive = google.drive({ version: "v3", auth });
      const created = await drive.files.create({
        requestBody: {
          name: `${safeFileName(record.patient.name || "paciente")}-${safeFileName(record.id || Date.now())}.json`,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          mimeType: "application/json"
        },
        media: {
          mimeType: "application/json",
          body: JSON.stringify(record, null, 2)
        },
        fields: "id"
      });
      driveFileId = created.data.id || "";
    }

    return json(200, { ok: true, driveFileId });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, error: error.message || "No fue posible guardar el registro." });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function buildSheetRow(record) {
  return [
    record.id || "",
    record.generatedAt || new Date().toISOString(),
    record.patient?.name || "",
    record.patient?.studyDate || "",
    record.patient?.birthDate || "",
    record.patient?.ageYears || "",
    record.patient?.sex || "",
    record.patient?.heightCm || "",
    record.patient?.weightKg || "",
    JSON.stringify(record.selectedStudies || []),
    JSON.stringify(record.interpretations || []),
    JSON.stringify(record.rawInputs || {}),
    JSON.stringify(record.summaries || {}),
    JSON.stringify(record.resultTables || []),
    JSON.stringify(record.references || [])
  ];
}

function safeFileName(value) {
  return String(value || "registro")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "registro";
}
