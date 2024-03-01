import { evaluate } from 'https://cdn.skypack.dev/bcx-expression-evaluator?dts';

export const jsonPath = (obj: any, path: string): any => {
    const parts = path.split('/').filter(p => !!p);
    let result = obj;
    for (const part of parts) {
        if (result === undefined) return undefined;

        const getPart = (val: any) => {
            if (part.includes('[')) {
                const exp = part.split('[')[1].split(']')[0];
                val = val[part.split('[')[0]];
                if (Array.isArray(val)) {
                    if (val.length === 0) {
                        return [];
                    }
                    const len = val.length;
                    const context = {
                        last: () => len - 1
                    };
                    const indexVal  = evaluate(exp, context);
                    if (typeof indexVal === 'number') {
                        val = val[indexVal];
                    } else {
                        const filtered = [];
                        for (const item of val) {
                            const condVal = evaluate(exp, item, context);
                            if (condVal) {
                                filtered.push(item);
                            }
                        }
                        val = filtered
                    }
                } else {
                    return undefined;
                }
            } else {
                val = val[part];
            }
            return val;
        }

        if (Array.isArray(result)) {
            result = result.map(getPart);
        } else {
            result = getPart(result);
        }
    }
    return result;
}