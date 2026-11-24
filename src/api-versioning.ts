import {
  VERSION_NEUTRAL,
  VersioningOptions,
  VersioningType,
} from "@nestjs/common";

export const API_VERSIONING_OPTIONS: VersioningOptions = {
  type: VersioningType.URI,
  defaultVersion: ["1", VERSION_NEUTRAL],
};
