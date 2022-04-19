export interface IAuthUser {
    token?: string;
    tokenExpiry?: Date;
    email: string;
    originalEmail: string;
    roles: string;
    password: string;
    exp?: number;
}

export function userIsAnon(user: IAuthUser) {
    return !user.email;
}