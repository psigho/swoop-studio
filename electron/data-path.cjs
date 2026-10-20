"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

/** Select a writable profile without writing into the installed application. */
function resolveDataDirectory({
  defaultDirectory,
  override,
  platform = process.platform,
  fileSystem = fs,
  paths = path,
}) {
  const prepare = (directory) => {
    for (const folder of [
      directory,
      paths.join(directory, "Session"),
      paths.join(directory, "Temp"),
    ]) {
      fileSystem.mkdirSync(folder, { recursive: true });
      // Existing directories can still deny writes. Probe the actual operation
      // used by the profile, cache and encoder rather than trusting existence.
      const probe = paths.join(folder, `.swoop-write-${randomUUID()}.tmp`);
      fileSystem.writeFileSync(probe, "", { flag: "wx" });
      fileSystem.unlinkSync(probe);
    }
    return directory;
  };

  if (override !== undefined) {
    if (typeof override !== "string" || !override.trim())
      throw new Error("SWOOP_DATA_DIR must name a writable app data folder.");
    const directory = paths.resolve(override);
    try {
      return prepare(directory);
    } catch (error) {
      throw new Error(
        `SWOOP_DATA_DIR cannot be used: ${directory}. Choose a writable folder or remove this override. ${error.message}`,
      );
    }
  }

  if (platform === "win32" && fileSystem.existsSync("K:\\")) {
    try {
      return prepare("K:\\_data\\swoop-studio");
    } catch {
      // K: is a preference. A disconnected or restricted drive must not keep
      // a normal per-user installation from starting.
    }
  }

  const directory = paths.resolve(defaultDirectory);
  try {
    return prepare(directory);
  } catch (error) {
    throw new Error(
      `Swoop Studio cannot write its app data folder: ${directory}. Check its permissions or set SWOOP_DATA_DIR to a writable folder. ${error.message}`,
    );
  }
}

module.exports = { resolveDataDirectory };
