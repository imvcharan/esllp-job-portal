import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../auth/auth.types";
import { UserNotification } from "../employers/user-notification.entity";

@Injectable()
export class CandidateNotificationsService {
  constructor(
    @InjectRepository(UserNotification)
    private readonly notificationsRepository: Repository<UserNotification>,
  ) {}

  async list(user: AuthenticatedUser, requestedPage = 1) {
    const page = Math.min(1_000_000, Math.max(1, requestedPage));
    const limit = 25;
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: { userId: user.id },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async markRead(user: AuthenticatedUser, notificationId: number) {
    const notification = await this.notificationsRepository.findOneBy({
      id: notificationId,
      userId: user.id,
    });
    if (!notification) {
      throw new NotFoundException("Notification was not found.");
    }
    notification.readAt ??= new Date();
    await this.notificationsRepository.save(notification);
    return { success: true };
  }
}
