const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const filePath = process.argv[2];
  const communityId = process.argv[3] || null;

  if (!filePath) {
    console.error("Usage: node scripts/import-golden-facebook.js <file-path> [community-id]");
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const body = fs.readFileSync(absolutePath, "utf8").trim();

  if (!body) {
    console.error("Golden dat file is empty.");
    process.exit(1);
  }

  const response = await fetch("http://localhost:3000/api/ingestion/facebook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-athena-ingestion-key": process.env.ATHENA_INGESTION_KEY,
    },
    body: JSON.stringify({
      communityId,
      title: path.basename(filePath, path.extname(filePath)),
      body,
      author: "Golden Dataset",
      url: null,
    }),
  });

  const payload = await response.json();

  if (!response.ok || !payload.success) {
    console.error("Import failed:");
    console.error(payload);
    process.exit(1);
  }

  console.log("Golden Facebook discussion imported and processed.");
  console.log({
    discussionId: payload.discussion?.id,
    workflowStatus: payload.workflow?.status,
    opportunityId: payload.workflow?.opportunity?.id,
    reviewId: payload.workflow?.review?.id,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
