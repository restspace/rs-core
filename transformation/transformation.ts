import { evaluate } from 'https://cdn.skypack.dev/bcx-expression-evaluator?dts';
import dayjs from "https://cdn.skypack.dev/dayjs@1.10.4";
import { Url } from "rs-core/Url.ts";
import { resolvePathPatternWithUrl } from "rs-core/PathPattern.ts";
import { firstMatch, pathCombine, scanFirst, upTo } from "../utility/utility.ts";
import { eachItem } from 'https://cdn.skypack.dev/-/ajv@v8.11.0-6F7JuaBGOwHo7L2fdKpW/dist=es2019,mode=types/dist/compile/util.d.ts';

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

export const transformation = (transformObject: any, data: any, url: Url = new Url('/')): any => {
    /*
    {
        transfList: "transformMap(origList, { x: y + 1 })" // takes origList and applies transform object to map x to y + 1
        user: "getUrl(userUrl)" // does a GET on the url and inserts the JSON value as a result
    }
    */
    const transformHelper = {
        Math: Math,
        transformMap: (list: ArrayLike<any>, transformObject: any) => 
            !list ? [] : Array.from(list, item => transformation(transformObject, Object.assign({}, data, item), url)),
        expressionReduce: (list: ArrayLike<any>, init: any, expression: string) => !list ? init : Array.from(list).reduce(
            (partial, item) => evaluate(expression, partial, Object.assign({}, transformHelper, data, item)),
            init),
        expressionReduce_expArgs: [2],
        expressionMap: (list: ArrayLike<any>, expression: string) => !list ? [] : Array.from(list).map(
            (item) => evaluate(expression, item, Object.assign({}, transformHelper, data))),
        expressionMap_expArgs: [1],
        expressionFilter: (list: ArrayLike<any>, expression: string) => !list ? [] : Array.from(list).filter(
            (item) => evaluate(expression, item, Object.assign({}, transformHelper, data))),
        expressionFilter_expArgs: [1],
        expressionFind: (list: ArrayLike<any>, expression: string) => !list ? null : Array.from(list).find(
            (item) => evaluate(expression, item, Object.assign({}, transformHelper, data))),
        expressionFind_expArgs: [1],
        expressionSort: (list: ArrayLike<any>, expression: string, dir?: string) => !list ? null : Array.from(list).sort(
            (a, b) => {
                const ctx = Object.assign({}, transformHelper, data);
                const expA = evaluate(expression, a, ctx);
                const expB = evaluate(expression, b, ctx);
                const res = expA == expB ? 0 : (expA < expB ? -1 : 1)
                return dir === 'desc' ? -res : res;
            }),
        expressionSort_expArgs: [1],
        unique: (list: ArrayLike<any>) => !list ? [] : [...new Set(Array.from(list))],
        pathCombine,
        // expressionGroup: (list: ArrayLike<any>, expression: string) => !list ? [] : groupBy(Array.from(list),
        //     (item) => evaluate(expression, item, Object.assign({}, transformHelper, data))),
        // expressionGroup_expArgs: [1],
        // merge: (obj0: object, ...objs: object[]) => merge(obj0, ...objs),
        pathPattern: (pattern: string) => 
            resolvePathPatternWithUrl(pattern, url, data),
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
            })
    }

    if (typeof transformObject === 'string') {
        return evaluate(transformObject, data, transformHelper);
    } else if (Array.isArray(transformObject)) {
        if (transformObject.length === 0
            || typeof transformObject[0] !== 'string'
            || !transformObject[0].endsWith("()")) {
                return transformObject.map(item => transformation(item, data, url));
        }
        const expr = arrayToFunction(transformObject, transformHelper);
        console.log('expr ' + expr);
        const arrResult = evaluate(expr, data, transformHelper);
        return arrResult;
    } else {
        let transformed: any = {};
        const selfObject = transformObject['$this'] || transformObject['.'];
        if (selfObject) {
            transformed = transformation(selfObject, data, url);
        }
        for (const key in transformObject) {
            if (key === '.' || key === '$this') continue;
            doTransformKey(key, 0, data, transformed, url, transformObject[key]);
        }
        return transformed;
    }
}

const doTransformKey = (key: string, keyStart: number, input: any, output: any, url: Url, subTransform: any) => {
    let [ match, newKeyStart ] = scanFirst(key, keyStart, [ '.', '[', '{' ]);
    console.log(`match: ${match}, start: ${newKeyStart}`);
    if (newKeyStart < 0) {
        const effectiveKey = key.slice(keyStart);
        output[effectiveKey] = transformation(subTransform, input, url);
    } else if (match === '.') {
        const keyPart = key.slice(keyStart, newKeyStart - 1);
        if (!(keyPart in input)) return;
        if (!(keyPart in output)) output[keyPart] = {};
        console.log(`recursing path, new start: ${newKeyStart}, new output: ${JSON.stringify(output[keyPart])}`);
        doTransformKey(key, newKeyStart, input, output[keyPart], url, subTransform);
    } else if (match === '[' || match === '{') {
        const keyPart = key.slice(keyStart, newKeyStart - 1);
        let newOutput = output;
        if (keyPart) {
            if (!(keyPart in output)) output[keyPart] = match === '[' ? [] : {};
            newOutput = output[keyPart];
        }
        const indexName = upTo(key, match === "[" ? "]" : "}", newKeyStart);
        newKeyStart += indexName.length + 1;
        const remainingKey = key.slice(newKeyStart);

        const transformOrRecurse = (input: any, index: number | string) => {
            if (remainingKey) {
                doTransformKey(remainingKey, 0, input, newOutput[indexName], url, subTransform);
            } else {
                newOutput[index] = transformation(subTransform, input, url);
            }
        }

        // plain numeric index in [] in path
        if (match === '[' && '0' <= indexName[0] && indexName[0] <= '9') {
            transformOrRecurse(input, parseInt(indexName));
        } else if (match === '[' && Array.isArray(newOutput)) { // loop context name in [] in path
            newOutput.forEach((item: any, idx: number) => {
                const newInput = {
                    ...item,
                    outer: input.outer || input,
                    [indexName]: { value: item, index: idx }
                };
                transformOrRecurse(newInput, idx);
            });
            if (!remainingKey) { // remove items set to undefined (mutate newOutput)
                for (let i = newOutput.length - 1; i >= 0; i--) {
                    if (newOutput[i] === undefined) newOutput.splice(i, 1);
                }
            }
        } else if (match === '{' && typeof newOutput === 'object') {
            Object.entries(newOutput).forEach(([key, value]) => {
                const newInput = {
                    ...(value as any),
                    "$key": key,
                    outer: input.outer || input,
                    [indexName]: { key, value }
                };
                transformOrRecurse(newInput, key);
            });
            if (!remainingKey) { // remove properties with values set to undefined
                newOutput = Object.fromEntries(Object.entries(newOutput).filter(([_, v]) => v !== undefined));
            }
        }
    }
}
