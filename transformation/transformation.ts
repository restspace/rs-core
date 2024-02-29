import { evaluate } from 'https://cdn.skypack.dev/bcx-expression-evaluator?dts';
import dayjs from "https://cdn.skypack.dev/dayjs@1.10.4";
import { Url } from "../Url.ts";
import { resolvePathPatternWithUrl } from "../PathPattern.ts";
import { pathCombine, scanFirst, shallowCopy, upTo } from "../utility/utility.ts";

const arrayToFunction = (arr: any[], transformHelper: Record<string, unknown>) => {
    if (arr.length === 0) return '';
    let functionName = arr[0];
    if (!functionName.endsWith('()')) return '';
    functionName = functionName.slice(0, -2);
    const args: string[] = [];
    for (let i = 1; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
            const arrayFunc = arrayToFunction(arr[i], transformHelper);
            if (arrayFunc) args.push(arrayFunc);
        } else if (typeof arr[i] === 'object') {
            let objectStr = JSON.stringify(arr[i]);
            args.push(objectStr);
        } else if (typeof arr[i] === 'string') {
            const expArgs = transformHelper[`${functionName}_expArgs`] as number[];
            let param = arr[i];
            if (expArgs && expArgs.indexOf(i - 1) >= 0) { // quote this argument if it will be used as an expression internally
                param = `"${arr[i].replace(/"/g, '\\"')}"`;
            }
            args.push(param);
        } else {
            args.push(arr[i].toString());
        }
    }
    return `${functionName}(${args.join(', ')})`;
}

const buildContext = (context: any): [ any, Record<string, unknown>] => {
    if (Array.isArray(context) || !(typeof context === 'object')) {
        return [ { $: context }, {} ];
    }
    const newContext = { ...context };
    return [ newContext, { $: newContext } ];
}

const doEvaluate = (expression: string, context: any, variables: Record<string, unknown>, helper: any) => {
    try {
        const [ newContext, newVariables ] = buildContext(context);
        return evaluate(expression, newContext, Object.assign({}, helper, variables, newVariables));
    } catch (err) {
        throw SyntaxError('Transform failed', {
            cause: err,
            fileName: expression
        } as ErrorOptions);
    }
}

const groupBy = (list: any[], keyGetter: (item: any) => string) => {
    const map = {} as Record<string, any[]>;
    list.forEach((item) => {
        const key = keyGetter(item);
        const collection = map[key];
        if (!collection) {
            map[key] = [item];
        } else {
            collection.push(item);
        }
    });
    return map;
}

export const transformation = (transformObject: any, data: any, url: Url = new Url('/'), name = '', variables = {} as Record<string, unknown>): any => {
    /*
    {
        transfList: "transformMap(origList, { x: y + 1 })" // takes origList and applies transform object to map x to y + 1
        user: "getUrl(userUrl)" // does a GET on the url and inserts the JSON value as a result
    }
    */
    if (Array.isArray(data)) data = { ...data, length: data.length };

    const transformHelper = {
        Math: Math,
        transformMap: (list: ArrayLike<any>, transformObject: any) => 
            !list ? [] : Array.from(list, item => transformation(transformObject, Object.assign({}, data, item), url, name, variables)),
        expressionReduce: (list: ArrayLike<any>, init: any, expression: string) => !list ? init : Array.from(list).reduce(
            (previous, item) => doEvaluate(expression, item, variables, Object.assign({}, transformHelper, data, { '$previous': previous })),
            init),
        expressionReduce_expArgs: [2],
        expressionMap: (list: ArrayLike<any>, expression: string) => !list ? [] : Array.from(list).map(
            (item) => doEvaluate(expression, item, variables, Object.assign({}, transformHelper, data))),
        expressionMap_expArgs: [1],
        expressionFilter: (list: ArrayLike<any>, expression: string) => !list ? [] : Array.from(list).filter(
            (item) => doEvaluate(expression, item, variables, Object.assign({}, transformHelper, data))),
        expressionFilter_expArgs: [1],
        expressionFind: (list: ArrayLike<any>, expression: string) => !list ? null : Array.from(list).find(
            (item) => doEvaluate(expression, item, variables, Object.assign({}, transformHelper, data))),
        expressionFind_expArgs: [1],
        expressionSort: (list: ArrayLike<any>, expression: string, dir?: string) => !list ? null : Array.from(list).sort(
            (a, b) => {
                const ctx = Object.assign({}, transformHelper, data);
                const expA = doEvaluate(expression, a, variables, ctx);
                const expB = doEvaluate(expression, b, variables, ctx);
                const res = expA == expB ? 0 : (expA < expB ? -1 : 1)
                return dir === 'desc' ? -res : res;
            }),
        expressionSort_expArgs: [1],
        unique: (list: ArrayLike<any>) => !list ? [] : Array.from(new Set(Array.from(list))),
        pathCombine,
        expressionGroup: (list: ArrayLike<any>, expression: string) => !list ? {} : groupBy(Array.from(list),
             (item) => evaluate(expression, item, Object.assign({}, transformHelper, data))),
        expressionGroup_expArgs: [1],
        expressionMax: (list: ArrayLike<any>, expression: string) => !list ? {} : Math.max(...Array.from(list).map(
            (item) => evaluate(expression, item, Object.assign({}, transformHelper, data)))),
        expressionMax_expArgs: [1],
        expressionMin: (list: ArrayLike<any>, expression: string) => !list ? {} : Math.min(...Array.from(list).map(
            (item) => evaluate(expression, item, Object.assign({}, transformHelper, data)))),
        expressionMin_expArgs: [1],
        merge: (...objs: object[]) => Object.assign({}, ...objs),
        pathPattern: (pattern: string, decode?: boolean) => 
            resolvePathPatternWithUrl(pattern, url, data, name, decode),
        newDate: (...args: any[]) => args.length === 0
            ? new Date()
            : (args.length === 1
                ? ( typeof(args[0]) === 'number' ? new Date(args[0]) : dayjs(args[0]).toDate() )
                : new Date(args[0], args[1], args[2], args[3], args[4], args[5], args[6])
            ),
        formatDate: (date: Date | string, format?: string) => 
            format === 'forQuery'
            ? `datetime'${dayjs(date).format().slice(0, -6)}'`
            : dayjs(date).format(format),
        propsToList: (obj: Record<string, unknown>, keyProp?: string) =>
            Object.entries(obj).map(([key, val]) => {
                (val as any)[keyProp || '$key'] = key;
                return val;
            }),
        literal: (obj: Record<string, unknown>) => obj,
        parseInt: (s: string, radix?: number) => parseInt(s, radix),
        parseFloat: (s: string) => parseFloat(s),
        uuid: () => crypto.randomUUID()
    }

    if (typeof transformObject === 'string') {
        return rectifyObject(doEvaluate(transformObject, data, variables, transformHelper));
    } else if (Array.isArray(transformObject)) {
        if (transformObject.length === 0
            || typeof transformObject[0] !== 'string'
            || !transformObject[0].endsWith("()")) {
                return transformObject.map(item => transformation(item, data, url, name, variables));
        }
        const expr = arrayToFunction(transformObject, transformHelper);
        console.log('expr ' + expr);
        const arrResult = doEvaluate(expr, data, variables, transformHelper);
        return arrResult;
    } else {
        let transformed: any = {};
        const selfObject = transformObject['$'] || transformObject['$this'] || transformObject['.'];
        if (selfObject) {
            transformed = shallowCopy(transformation(selfObject, data, url, name, variables));
        }
        for (let key in transformObject) {
            if (key === '.' || key === '$this' || key === '$') continue;
            if (key.startsWith('$') && key.length > 1 && key !== '$key' && !key.startsWith('$$')) {
                variables[key] = shallowCopy(transformation(transformObject[key], data, url, name, variables));
            } else {
                let keyStart = 0;
                if (key.startsWith('$$') && key.length > 2) keyStart = 1;
                doTransformKey(key, keyStart, data, transformed, url, transformObject[key], name, variables);
            }
        }
        return rectifyObject(transformed);
    }
}

const rectifyObject = (obj: any) => {
    let newObj = obj;
    if (typeof obj === 'object' && 'length' in obj && !Array.isArray(obj)) {
        newObj = Array.from(obj);
    }

    return newObj;
};

// Here we take a key (a property path) into the output data and assign the input to it.
// To do this safely we need to ensure we're not updating something that has a reference to it
// elsewhere in the output which would make the update affect multiple points on the property
// tree of the output, so we copy the output tree shallowly each time we follow a segment of the
// property path
const doTransformKey = (key: string, keyStart: number, input: any, output: any, url: Url, subTransform: any, name: string, variables: Record<string, unknown>) => {
    let [ match, newKeyStart ] = scanFirst(key, keyStart, [ '.', '[', '{' ]);
    if (newKeyStart < 0) {
        const effectiveKey = key.slice(keyStart);
        output[effectiveKey] = shallowCopy(transformation(subTransform, input, url, name, variables));
    } else if (match === '.') {
        const keyPart = key.slice(keyStart, newKeyStart - 1).trim();
        if (!(keyPart in output)) {
            output[keyPart] = {};
        } else {
            output[keyPart] = shallowCopy(output[keyPart]);
        }
        console.log(`recursing path, new start: ${newKeyStart}, new output: ${JSON.stringify(output[keyPart])}`);
        doTransformKey(key, newKeyStart, input, output[keyPart], url, subTransform, name, variables);
    } else if (match === '[' || match === '{') {
        const keyPart = key.slice(keyStart, newKeyStart - 1).trim(); // the property key before the array
        let newOutput = output;
        if (keyPart) {
            if (!(keyPart in output)) {
                output[keyPart] = match === '[' ? [] : {};
            } else {
                output[keyPart] = shallowCopy(output[keyPart]);
            }
            newOutput = output[keyPart];
        }
        let indexName = upTo(key, match === "[" ? "]" : "}", newKeyStart);
        newKeyStart += indexName.length + 1;
        indexName = indexName.trim();
        const remainingKey = key.slice(newKeyStart + 1);

        const transformOrRecurse = (input: any, index: number | string, output: any) => {
            if (remainingKey) {
                output[index] = shallowCopy(output[index]);
                doTransformKey(remainingKey, 0, input, output[index], url, subTransform, name, variables);
            } else {
                output[index] = shallowCopy(transformation(subTransform, input, url, name, variables));
            }
        }

        // plain numeric index in [] in path
        if (match === '[' && '0' <= indexName[0] && indexName[0] <= '9') {
            transformOrRecurse(input, parseInt(indexName), newOutput);
        } else if (match === '[') { // loop context name in [] in path
            let list = newOutput;

            if (!Array.isArray(newOutput) && !(typeof newOutput === 'object' && 'length' in newOutput)) {
                if (typeof newOutput === 'object') {
                    list = Object.entries(newOutput).map(([k, v]) => (
                        typeof v === 'object'
                        ? { ...(v as any), "$key": k }
                        : v
                    ));
                    //for (const k in newOutput) delete newOutput[k];
                } else {
                    return;
                }
            }

            const loopItem = {} as Record<string, unknown>;
            Array.from(list).forEach((item: any, idx: number) => {
                loopItem['value'] = item;
                loopItem['index'] = idx;
                const newInput = {
                    ...input,
                    ...item,
                    outer: input.outer || input,
                    [indexName]: loopItem
                };
                transformOrRecurse(newInput, idx, newOutput);
            });
            if (!('length' in newOutput)) newOutput.length = list.length;
            if (!remainingKey) { // remove items set to undefined (mutate newOutput)
                for (let i = newOutput.length - 1; i >= 0; i--) {
                    if (newOutput[i] === undefined) newOutput.splice(i, 1);
                }
            }
        } else if (match === '{') {
            Object.entries(newOutput).forEach(([key, value]) => {
                const newInput = {
                    ...input,
                    ...(value as any),
                    "$key": key,
                    outer: input.outer || input,
                    [indexName]: { key, value }
                };
                transformOrRecurse(newInput, key, newOutput);
            });
            if (!remainingKey) { // remove properties with values set to undefined
                newOutput = Object.fromEntries(Object.entries(newOutput).filter(([_, v]) => v !== undefined));
            }
        }
    }
}
