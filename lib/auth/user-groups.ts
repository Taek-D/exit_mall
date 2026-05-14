export type UserGroup = 'group1' | 'group2';

export const USER_GROUPS: readonly UserGroup[] = ['group1', 'group2'] as const;

export const USER_GROUP_LABEL: Record<UserGroup, string> = {
  group1: '1그룹 (엑시트몰 전체)',
  group2: '2그룹 (배송대행 전용)',
};

export const USER_GROUP_SHORT_LABEL: Record<UserGroup, string> = {
  group1: '1그룹',
  group2: '2그룹',
};

// group2가 접근 가능한 경로 prefix.
// `/inbound-template.xlsx`는 입고리스트 페이지에서 직접 링크되는 공개 템플릿이라
// 정확히 일치 검사를 위해 포함한다.
export const GROUP2_ALLOWED_PREFIXES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/inbound-template.xlsx',
  '/account',
] as const;

// group2 사용자가 차단된 경로로 진입하거나 / 로 진입할 때 보낼 홈
export const GROUP2_HOME = '/shipping-uploads/purchased';

export function isPathAllowedForGroup2(pathname: string): boolean {
  return GROUP2_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export function isUserGroup(value: unknown): value is UserGroup {
  return value === 'group1' || value === 'group2';
}

export function isSelfUserGroupChange(actorUserId: string, targetUserId: string): boolean {
  return actorUserId === targetUserId;
}
