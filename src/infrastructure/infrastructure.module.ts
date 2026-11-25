import { Module } from "@nestjs/common";
import { RedisCacheService } from "./redis-cache.service";
import { JobQueueService } from "./job-queue.service";
import { OpenSearchService } from "./open-search.service";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";

@Module({
  providers: [
    RedisCacheService,
    JobQueueService,
    OpenSearchService,
    WorkerHeartbeatService,
  ],
  exports: [
    RedisCacheService,
    JobQueueService,
    OpenSearchService,
    WorkerHeartbeatService,
  ],
})
export class InfrastructureModule {}
