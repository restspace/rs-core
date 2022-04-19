import { Message } from "../Message.ts";
import { resolvePathPatternWithObject } from "../PathPattern.ts";
import { SimpleServiceContext } from "../ServiceContext.ts";
import { IAuthUser } from "./IAuthUser.ts";

export async function getUserFromEmail(context: SimpleServiceContext, userUrlPattern: string, msg: Message, email: string, internalPrivilege = false): Promise<IAuthUser | null> {
    if (!email) return null;

    const userUrl = resolvePathPatternWithObject(userUrlPattern, { email }, [], '', '') as string;
    const getUser = msg.copy().setMethod("GET").setUrl(userUrl);

    getUser.internalPrivilege = internalPrivilege;
    const fullUserMsg = await context.makeRequest(getUser);
    getUser.internalPrivilege = false;

    const fullUser = fullUserMsg && fullUserMsg.data && fullUserMsg.ok ? (await fullUserMsg.data.asJson().catch(() => null)) : null;
    return fullUser;
}

export async function saveUser(context: SimpleServiceContext, userUrlPattern: string, msg: Message, user: IAuthUser, internalPrivilege = false): Promise<Message> {
    const userUrl = resolvePathPatternWithObject(userUrlPattern, { email: user.email }, [], '', '') as string;
    const putUser = msg.copy().setUrl(userUrl).setMethod('PUT').setDataJson(user);

    putUser.internalPrivilege = internalPrivilege;
    const putUserMsg = await context.makeRequest(putUser);
    putUser.internalPrivilege = false;

    return putUserMsg;
}

