import { AdapterContext } from "../ServiceContext.ts";

/**
 * Basic interface which tags something as being an Adapter class
 */
export interface IAdapter {
    props: Record<string, any>;
    context: AdapterContext;
}

/**
 * Optional adapter lifecycle contract for resources that need cleanup.
 */
export interface IDisposableAdapter extends IAdapter {
    close(): Promise<void>;
}