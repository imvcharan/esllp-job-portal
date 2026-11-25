import { Module } from "@nestjs/common";
import { CandidateFileScanService } from "./candidate-file-scan.service";
import { CandidateFileStorageService } from "./candidate-file-storage.service";
import { CandidatePrivateFileProcessor } from "./candidate-private-file-processor.service";

@Module({
  providers: [
    CandidateFileScanService,
    CandidateFileStorageService,
    CandidatePrivateFileProcessor,
  ],
  exports: [
    CandidateFileScanService,
    CandidateFileStorageService,
    CandidatePrivateFileProcessor,
  ],
})
export class CandidateStorageModule {}
