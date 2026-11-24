import { Module } from "@nestjs/common";
import { CandidateFileScanService } from "./candidate-file-scan.service";
import { CandidateFileStorageService } from "./candidate-file-storage.service";

@Module({
  providers: [CandidateFileScanService, CandidateFileStorageService],
  exports: [CandidateFileScanService, CandidateFileStorageService],
})
export class CandidateStorageModule {}
