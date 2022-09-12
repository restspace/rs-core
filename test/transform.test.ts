import { assertEquals } from "std/testing/asserts.ts";
import { transformation } from '../transformation/transformation.ts';

/*
Deno.test('single var', function () {
    const input = {
        a: 1,
        b: 2
    };
    const transform = {
        q: "a"
    };
    const output = transformation(transform, input);
    assertEquals(output.q, 1);
});
Deno.test('this override', function () {
    const input = {
        a: 1,
        b: 2
    };
    const transform = {
        "$this": "$this",
        b: "'abc'"
    };
    const output = transformation(transform, input);
    assertEquals(output.a, 1);
    assertEquals(output.b, 'abc');
});
Deno.test('this list', function () {
    const input = [ 3, 2, 1 ];
    const transform = {
        "$this": "$this",
        "1": "9"
    };
    const output = transformation(transform, input);
    assertEquals(output[0], 3);
    assertEquals(output[1], 9);
});

Deno.test('path key', function () {
    const input = {
        a: "xyz",
        b: {
            x: "mno",
            y: "pqr"
        }
    };
    const transform = {
        "$this": "$this",
        "b.x": "'zzz'"
    };
    const output = transformation(transform, input);
    assertEquals(output.b.x, "zzz");
    assertEquals(output.b.y, "pqr");
});
*/
Deno.test('path array', function () {
    const input = {
        a: "xyz",
        b: [ 9, 8, 7 ]
    };
    const transform = {
        "$this": "$this",
        "b[1]": "16"
    };
    const output = transformation(transform, input);
    assertEquals(output.b, [ 9, 16, 7 ]);
});

Deno.test('path array loop', function () {
    const input = {
        a: "xyz",
        b: [ 9, 8, 7 ]
    };
    const transform = {
        "$this": "$this",
        "b[item]": "item.value * 2"
    };
    const output = transformation(transform, input);
    assertEquals(output.b, [ 18, 16, 14 ]);
});

Deno.test('path object loop', function () {
    const input = {
        a: "xyz",
        b: { a: 1, b: 2, c: 3 }
    };
    const transform = {
        "$this": "$this",
        "b{prop}": "`${prop.key}-${prop.value}`"
    };
    const output = transformation(transform, input);
    assertEquals(output.b, { a: 'a-1', b: 'b-2', c: 'c-3' });
});

Deno.test('path array loop, not preexisting', function () {
    const input = {
        a: "xyz",
        b: [ 9, 8, 7 ]
    };
    const transform = {
        "$this": "$this",
        "c": "b",
        "c[item]": "b[item.index] * 2"
    };
    const output = transformation(transform, input);
    assertEquals(output.c, [ 18, 16, 14 ]);
});

Deno.test('path array loop over objects', function () {
    const input = {
        a: "xyz",
        b: [ { a: 1, b: 2}, { a: 3, b: 4 }, { a: 5, b: 6} ]
    };
    const transform = {
        "c": "b",
        "c[item]": {
            a: "a"
        }
    };
    const output = transformation(transform, input);
    assertEquals(output.c, [ { a: 1 }, { a: 3 }, { a: 5 } ]);
});

Deno.test('filter path array loop over objects', function () {
    const input = {
        a: "xyz",
        b: [ { a: 1, b: 2}, { a: 3, b: 4 }, { a: 5, b: 6} ]
    };
    const transform = {
        "c": "b",
        "c[item]": "a > 2 ? item.value : undefined"
    };
    const output = transformation(transform, input);
    assertEquals(output.c, [ { a: 3, b: 4 }, { a: 5, b: 6 } ]);
});