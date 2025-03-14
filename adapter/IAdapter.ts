import { AdapterContext } from "../ServiceContext.ts";

/**
 * Basic interface which tags something as being an Adapter class
 */
export interface IAdapter {
    props: Record<string, any>;
    context: AdapterContext;
}