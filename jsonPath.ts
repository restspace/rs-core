import { evaluate } from 'https://cdn.skypack.dev/bcx-expression-evaluator?dts';
import { scanFirst } from './utility/utility.ts';

const applySelect = (val: any, prop?: string, filter?: string) => {
    if (val === undefined) return undefined;
    if (filter !== undefined && Array.isArray(val)) {
        if (filter === '') return val;
        const len = val.length;
        if (len === 0) return [];
        const context = {
            last: () => len - 1
        };
        const indexVal = evaluate(filter, context);
        if (typeof indexVal === 'number') return val[indexVal];
        return val.filter(item => evaluate(filter, item, context));
    } else if (prop !== undefined) {
        if (prop === '') return val;
        return Array.isArray(val) ? val.flatMap(item => item[prop]) : val[prop];
    } else {
        return undefined;
    }
};

export const jsonPath = (obj: any, path: string): any => {
    let pos = 0;
    let result = obj;
    let mode = 'prop' as 'prop' | 'filter' | 'postFilter' | 'done';
    path = path.startsWith('/') ? path.substring(1) : path;

    do {
        let prop: string | undefined = undefined;
        let filter: string | undefined = undefined;
        switch (mode) {
            case 'prop':
            case 'postFilter': {
                let newPos: number;
                let matched: string;
                [matched, newPos] = scanFirst(path, pos, ['/', '.', '[', '"']);
                if (matched === '"' && mode === 'prop') {
                    pos = newPos;
                    newPos = path.indexOf('"', pos);
                    if (newPos > 0) newPos++;
                }
                prop = path.slice(pos, newPos < 0 ? undefined : newPos - 1);
                if (matched === '"' && mode === 'prop') {
                    [matched, newPos] = scanFirst(path, newPos, ['/', '.', '[']);
                }
                if (mode === 'postFilter' && Array.isArray(result)) result = result.flat(1);
                mode = newPos < 0
                    ? 'done'
                    : path[newPos - 1] === '['
                        ? 'filter'
                        : 'prop';
                pos = newPos;
                break;
            }
            case 'filter': {
                const newPos = path.indexOf(']', pos);
                filter = path.slice(pos, newPos);
                mode = 'postFilter';
                pos = newPos + 1;
                break;
            }
        }

        result = applySelect(result, prop, filter);
    } while (pos >= 0 && pos <= path.length);

    return result;
}