export type PlatformUser = {
  id?: string;
  entraObjectId?: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  team: string;
  firstName?: string;
  lastName?: string;
  jobTitle?: string | null;
  department?: string | null;
};
