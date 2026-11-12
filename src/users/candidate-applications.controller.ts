import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateApplicationsService } from "./candidate-applications.service";
import { SubmitCandidateApplicationDto } from "./dto/submit-candidate-application.dto";
import { CreateCandidateApplicationMessageDto } from "./dto/create-candidate-application-message.dto";
import { RespondToCandidateApplicationOfferDto } from "./dto/respond-to-candidate-application-offer.dto";
import { CandidateFileScanService } from "./candidate-file-scan.service";

@Controller("candidate/applications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateApplicationsController {
  constructor(
    private readonly applicationsService: CandidateApplicationsService,
    private readonly fileScan: CandidateFileScanService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.applicationsService.list(user, page, limit);
  }

  @Get(":jobId")
  @Header("Cache-Control", "private, no-store")
  getForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
  ) {
    return this.applicationsService.getForJob(user, jobId);
  }

  @Get(":jobId/documents")
  @Header("Cache-Control", "private, no-store")
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
  ) {
    return this.applicationsService.listUploadedDocuments(user, jobId);
  }

  @Post(":jobId/documents/:documentId")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Param("documentId") documentId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException("Choose a PDF or DOCX document to upload.");
    const isPdf =
      file.buffer.subarray(0, 5).toString("ascii") === "%PDF-" &&
      (file.mimetype === "application/pdf" ||
        file.originalname.toLowerCase().endsWith(".pdf"));
    const isDocx =
      file.buffer.subarray(0, 4).toString("ascii") === "PK\u0003\u0004" &&
      (file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.originalname.toLowerCase().endsWith(".docx"));
    if (!isPdf && !isDocx)
      throw new BadRequestException(
        "Application documents must be valid PDF or DOCX files.",
      );
    await this.fileScan.scan(file.buffer);
    return this.applicationsService.uploadDocument(user, jobId, documentId, {
      buffer: file.buffer,
      originalname: file.originalname,
      contentType: isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  @Post(":jobId")
  @Header("Cache-Control", "private, no-store")
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("jobId", ParseIntPipe) jobId: number,
    @Body() dto: SubmitCandidateApplicationDto,
  ) {
    return this.applicationsService.submit(user, jobId, dto);
  }

  @Post("records/:applicationId/withdraw")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
  ) {
    return this.applicationsService.withdraw(user, applicationId);
  }

  @Get("records/:applicationId/messages")
  @Header("Cache-Control", "private, no-store")
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
  ) {
    return this.applicationsService.listMessages(user, applicationId);
  }

  @Post("records/:applicationId/messages")
  @Header("Cache-Control", "private, no-store")
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: CreateCandidateApplicationMessageDto,
  ) {
    return this.applicationsService.sendMessage(user, applicationId, dto);
  }

  @Post("records/:applicationId/offer-response")
  @Header("Cache-Control", "private, no-store")
  respondToOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param("applicationId", ParseIntPipe) applicationId: number,
    @Body() dto: RespondToCandidateApplicationOfferDto,
  ) {
    return this.applicationsService.respondToOffer(
      user,
      applicationId,
      dto.decision,
    );
  }
}
