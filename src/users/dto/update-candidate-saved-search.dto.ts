import { PartialType } from "@nestjs/mapped-types";
import { CreateCandidateSavedSearchDto } from "./create-candidate-saved-search.dto";

export class UpdateCandidateSavedSearchDto extends PartialType(
  CreateCandidateSavedSearchDto,
) {}
