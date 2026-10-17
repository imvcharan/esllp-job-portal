import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import sharp from "sharp";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UserRole } from "./user.entity";
import { CandidateProfileService } from "./candidate-profile.service";
import { UpdateCandidateProfileDto } from "./dto/update-candidate-profile.dto";

@Controller("candidate/profile")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CANDIDATE)
export class CandidateProfileController {
  constructor(private readonly profileService: CandidateProfileService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.get(user);
  }

  @Put()
  @Header("Cache-Control", "private, no-store")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCandidateProfileDto,
  ) {
    return this.profileService.update(user, dto);
  }

  @Post("photo")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 6 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
        ) {
          callback(
            new BadRequestException(
              "Choose a JPEG, PNG, or WebP profile image.",
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Choose a profile image to upload.");
    }
    let image: Buffer;
    try {
      image = await sharp(file.buffer, {
        failOn: "error",
        limitInputPixels: 20_000_000,
      })
        .rotate()
        .resize(512, 512, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException(
        "The image could not be decoded. Choose a valid JPEG, PNG, or WebP image.",
        { cause: error },
      );
    }
    return this.profileService.uploadPhoto(user, image);
  }

  @Delete("photo")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  removePhoto(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.removePhoto(user);
  }

  @Post("resume")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  uploadResume(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Choose a PDF resume to upload.");
    }
    if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new BadRequestException(
        "Resume uploads must be valid PDF documents.",
      );
    }
    return this.profileService.uploadResume(
      user,
      file.buffer,
      file.originalname,
    );
  }

  @Delete("resume")
  @Header("Cache-Control", "private, no-store")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  removeResume(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.removeResume(user);
  }
}
