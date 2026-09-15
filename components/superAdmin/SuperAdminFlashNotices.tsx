import {
  SUPER_ADMIN_ERROR_NOTICE_CLASS,
  SUPER_ADMIN_SUCCESS_NOTICE_CLASS,
} from "@/lib/superAdmin/superAdminPresentation";

type SuperAdminFlashNoticesProps = {
  notices: Array<string | null | undefined>;
  errors: Array<string | null | undefined>;
};

export function SuperAdminFlashNotices({
  notices,
  errors,
}: SuperAdminFlashNoticesProps) {
  const visibleNotices = notices.filter((value): value is string =>
    Boolean(value),
  );
  const visibleErrors = errors.filter((value): value is string =>
    Boolean(value),
  );

  if (visibleNotices.length === 0 && visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {visibleNotices.map((notice) => (
        <div key={notice} className={SUPER_ADMIN_SUCCESS_NOTICE_CLASS}>
          {notice}
        </div>
      ))}
      {visibleErrors.map((error) => (
        <div key={error} className={SUPER_ADMIN_ERROR_NOTICE_CLASS}>
          {error}
        </div>
      ))}
    </div>
  );
}
