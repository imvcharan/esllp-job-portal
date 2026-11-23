import { MigrationInterface, QueryRunner } from "typeorm";

const defaultContent = [
  {
    type: "faq",
    slug: "creating-and-verifying-an-account",
    title: "How do I create and verify my account?",
    summary: null,
    body: "Choose Create account and follow the verification steps shown on screen. Keep your email address and phone number current so you can receive verification codes. Never share a one-time code or password with anyone.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "faq",
    slug: "searching-and-applying-for-jobs",
    title: "How can I search and apply for jobs?",
    summary: null,
    body: "Search by role, skill, company, or location, then narrow results with the available filters. Open a published listing and review its requirements before applying. The application flow lets you review the information and sharing choices before you submit.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "faq",
    slug: "who-can-see-my-profile-and-resume",
    title: "Who can see my profile and resume?",
    summary: null,
    body: "Your profile visibility and permission for recruiters to contact you are separate settings. Review both in your profile before making your information discoverable. You choose whether to attach a resume or share a profile snapshot with each application.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "faq",
    slug: "checking-application-status",
    title: "Where can I check my application status?",
    summary: null,
    body: "Sign in and open your candidate dashboard to review applications and their latest recorded status. Employers manage application decisions, so contact the employer through the available application messaging options if you need more information.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "faq",
    slug: "requesting-account-deletion",
    title: "How do I request account deletion?",
    summary: null,
    body: "Submit a deletion request from your account settings. A superadmin reviews the request; submitting it does not immediately delete your account. Linked records and applicable retention requirements may affect whether deletion can be completed.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "faq",
    slug: "employer-job-publication",
    title: "When will an employer's job listing appear?",
    summary: null,
    body: "New listings may remain drafts or require review before publication, depending on the platform's current settings and the employer account's status. An employer should check the Hiring workspace for the listing's latest status.",
    seoTitle: null,
    seoDescription: null,
  },
  {
    type: "blog",
    slug: "a-practical-checklist-before-you-apply",
    title: "A practical checklist before you apply",
    summary:
      "A few careful checks can help you submit a clear, complete application.",
    body: "Read the full job description and confirm the location, work arrangement, employment type, and experience requirements fit what you are looking for.\n\nReview your profile for current skills and work history. Answer application questions accurately, and check every document before attaching it.\n\nBefore submitting, review the profile and resume sharing choices shown for that specific application. You can follow recorded application updates from your candidate dashboard.",
    seoTitle: "A practical checklist before applying for a job",
    seoDescription:
      "Review job requirements, your candidate profile, application answers, and document-sharing choices before applying.",
  },
  {
    type: "blog",
    slug: "make-your-candidate-profile-clear-and-useful",
    title: "Make your candidate profile clear and useful",
    summary:
      "Present your experience and skills clearly, and keep your visibility choices under your control.",
    body: "Start with a concise headline that reflects the kind of work you do. Describe recent responsibilities and outcomes in plain language, and list the skills you can discuss with confidence.\n\nKeep your work history and preferred locations current. If you upload a resume, review the information extracted from it before adding suggestions to your profile.\n\nChoose profile visibility and recruiter-contact permissions deliberately. These settings are separate, and you can review them whenever your preferences change.",
    seoTitle: "How to create a clear candidate profile",
    seoDescription:
      "Practical suggestions for presenting skills and experience while managing profile visibility and recruiter-contact settings.",
  },
  {
    type: "blog",
    slug: "write-a-job-listing-candidates-can-understand",
    title: "Write a job listing candidates can understand",
    summary:
      "Clear requirements and accurate details help candidates decide whether a role is right for them.",
    body: "Use a specific job title and describe the responsibilities candidates will actually handle. Separate required qualifications from preferred experience, and use concrete language instead of unexplained abbreviations.\n\nState the work location, remote or hybrid expectations, employment type, and compensation details when available. Keep deadlines and opening counts accurate, and review the listing before publishing it.\n\nRespond to applicants consistently and keep application statuses current. Do not include personal or sensitive information that is not needed to explain the role.",
    seoTitle: "How to write a clear job listing",
    seoDescription:
      "Guidance for employers on writing accurate job descriptions with clear responsibilities, requirements, work arrangements, and compensation details.",
  },
] as const;

export class SeedDefaultFaqAndBlogContent1729000000051 implements MigrationInterface {
  name = "SeedDefaultFaqAndBlogContent1729000000051";

  async up(queryRunner: QueryRunner): Promise<void> {
    const valuesPerEntry = 7;
    const valueGroups = defaultContent.map((_, entryIndex) => {
      const start = entryIndex * valuesPerEntry + 1;
      return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}, TRUE, NOW(), NULL, NULL)`;
    });
    const parameters = defaultContent.flatMap((entry) => [
      entry.type,
      entry.slug,
      entry.title,
      entry.summary,
      entry.body,
      entry.seoTitle,
      entry.seoDescription,
    ]);

    await queryRunner.query(
      `INSERT INTO content_entries (
        type,
        slug,
        title,
        summary,
        body,
        seo_title,
        seo_description,
        is_published,
        published_at,
        created_by_user_id,
        updated_by_user_id
      ) VALUES ${valueGroups.join(", ")}
      ON CONFLICT (slug) DO NOTHING`,
      parameters,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Starter entries may have been edited by administrators after deployment.
  }
}
