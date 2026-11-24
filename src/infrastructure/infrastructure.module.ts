import { Module } from "@nestjs/common";
import { RedisCacheService } from "./redis-cache.service";
import { JobQueueService } from "./job-queue.service";
import { OpenSearchService } from "./open-search.service";

@Module({
  providers: [RedisCacheService, JobQueueService, OpenSearchService],
  exports: [RedisCacheService, JobQueueService, OpenSearchService],
})
export class InfrastructureModule {}
