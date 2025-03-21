import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { jsonPath } from '../jsonPath.ts';

Deno.test('single var', function () {
    const input = {
        a: 1,
        b: 2
    };
    const path = "/a";
    const output = jsonPath(input, path);
    assertEquals(output, 1);
});
Deno.test('root', function () {
    const input = {
        a: 1,
        b: 2
    };
    const path = "/";
    const output = jsonPath(input, path);
    assertEquals(output, input);
});
Deno.test('single var on list', function () {
    const input = [
        {
            a: [1, 9],
            b: 2
        },
        {
            a: [3, 5],
            b: 4
        }
    ];
    const path = "/a";
    const output = jsonPath(input, path);
    assertEquals(output, [ 1, 9, 3, 5 ]);
});

Deno.test('bad path', function () {
    const input = {
        a: 1,
        b: 2
    };
    const path = "/x/y";
    const output = jsonPath(input, path);
    assertEquals(output, undefined);
});
Deno.test('bad path 1', function () {
    const input = 
        {
            a: [ 1, 2, 3 ]
        };
    const path = "/a/y/z";
    const output = jsonPath(input, path);
    assertEquals(output, []);
});
Deno.test('bad path 2', function () {
    const input: any[] = [];
    const path = "/x";
    const output = jsonPath(input, path);
    assertEquals(output, []);
});
Deno.test('props', function () {
    const input = {
        a: 1,
        b: {
            c: {
                e: 2
            },
            d: 3
        }
    };
    const path = "/b/c/e";
    const output = jsonPath(input, path);
    assertEquals(output, 2);
});
Deno.test('array by index', function () {
    const input = {
        a: 9,
        b: {
            c: [ 1, 2, 3 ]
        }
    };
    const path = "/b/c[1]";
    const output = jsonPath(input, path);
    assertEquals(output, 2);
});
Deno.test('dot separator', function () {
    const input = {
        a: 9,
        b: {
            c: [ 1, 2, 3 ]
        }
    };
    const path = "b.c[1]";
    const output = jsonPath(input, path);
    assertEquals(output, 2);
});
Deno.test('quote escape', function () {
    const input = {
        a: 9,
        b: {
            'c[]': [ 1, 2, 3 ]
        }
    };
    const path = 'b."c[]"[1]';
    const output = jsonPath(input, path);
    assertEquals(output, 2);
});
Deno.test('array by last', function () {
    const input = {
        a: 9,
        b: {
            c: [ 1, 2, 3 ]
        }
    };
    const path = "/b/c[last()]";
    const output = jsonPath(input, path);
    assertEquals(output, 3);
});
Deno.test('array by filter', function () {
    const input = {
        a: 9,
        b: {
            c: [ 1, 2, 3 ]
        }
    };
    const path = "/b/c[$this > 1]";
    const output = jsonPath(input, path);
    assertEquals(output, [ 2, 3 ]);
});
Deno.test('nested arrays', function () {
    const input = {
        a: 9,
        b: {
            c: [
                {
                    e: 1,
                    d: [ { e: 1 }, { e: 2 }, { e: 3 } ]
                },
                {
                    e: 2,
                    d: [ { e: 4 }, { e: 5 }, { e: 6 } ]
                },
                {
                    e: 3,
                    d: [ { e: 7 }, { e: 8 }, { e: 9 } ]
                }
            ]
        }
    };
    const path = "/b/c[e >= 2]/d[e > 5]/e";
    const output = jsonPath(input, path);
    assertEquals(output, [ 6, 7, 8, 9 ]);
});
Deno.test('multi-filter', function () {
    const input = {
        a: 9,
        b: [
            [
                { e: 1 },
                { e: 2 },
                { e: 3 }
            ],
            [
                { e: 4 },
                { e: 5 },
                { e: 6 }
            ],
            [
                { e: 7 },
                { e: 8 },
                { e: 9 }
            ]
        ]
    };
    const path = "/b[][e > 3]/e";
    const output = jsonPath(input, path);
    assertEquals(output, [ 4, 5, 6, 7, 8, 9 ]);
});
