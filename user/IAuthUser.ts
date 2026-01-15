export interface IAuthUser {
    token?: string;
    tokenExpiry?: Date;
    email: string;
    originalEmail: string;
    roles: string;
    password: string;
    exp?: number;
    /** Allow custom fields for data-field authorization (e.g., organisationId) */
    [key: string]: unknown;
}

export function userIsAnon(user: IAuthUser) {
    return !user.email;
}