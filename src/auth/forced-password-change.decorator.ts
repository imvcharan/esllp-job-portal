import { SetMetadata } from "@nestjs/common";

export const ALLOW_FORCED_PASSWORD_CHANGE = "allowForcedPasswordChange";

export const AllowForcedPasswordChange = () =>
  SetMetadata(ALLOW_FORCED_PASSWORD_CHANGE, true);
