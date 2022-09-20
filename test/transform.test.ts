import { assertEquals, assertThrows } from "std/testing/asserts.ts";
import { transformation } from '../transformation/transformation.ts';


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
Deno.test('error generation', function () {
    const input = {
        a: 1,
        b: 2
    };
    const transform = {
        q: "n"
    };
    const output = transformation(transform, input);
    assertEquals(output.q, undefined);
});
Deno.test('error generation 2', function () {
    const input = {
        a: 1,
        b: 2
    };
    const transform = {
        q: "/abc/def"
    };
    assertThrows(() => transformation(transform, input));
});
Deno.test('subobject', function () {
    const input = {
        a: 1,
        b: {
            x: 10,
            y: 20
        }
    };
    const transform = {
        "b": "b.x"
    };
    const output = transformation(transform, input);
    assertEquals(output.b, 10);
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

Deno.test('path array loop, not preexisting, outer', function () {
    const input = {
        a: "xyz",
        b: [ 9, 8, 7 ]
    };
    const transform = {
        "$this": "$this",
        "c": "b",
        "c[item]": "outer.b[item.index] * 2"
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
        "c[ item ]": "a > 2 ? item.value : undefined"
    };
    const output = transformation(transform, input);
    assertEquals(output.c, [ { a: 3, b: 4 }, { a: 5, b: 6 } ]);
});

Deno.test('transform a list', function () {
    const input = [
        {
            a: 1, b: 2
        },
        {
            a: 3, b: 4
        },
        {
            a: 5, b: 6
        }
    ];
    const transform = {
        "$this": "$this",
        "[item]": { a: "a" }
    };
    const output = transformation(transform, input);
    assertEquals(output, [ { a: 1 }, { a: 3 }, { a: 5 } ]);
});

Deno.test('convert object to list', function () {
    const input = {
        a: 1,
        b: 2,
        c: 3
    };
    const transform = {
        "$this": "$this",
        "[item]": "item.value"
    };
    const output = transformation(transform, input);
    assertEquals(output, [ 1, 2, 3 ]);
});

Deno.test('avoid output multiple paths pointing to same data', function () {
    const input = {
        a: [ 1, 2, 3 ]
    };
    const transform = {
        "$this": "$this",
        "b": "a",
        "b[0]": "9"
    };
    const output = transformation(transform, input);
    assertEquals(output.a[0], 1);
});
Deno.test('avoid output multiple paths pointing to same data (deep)', function () {
    const input = {
        a: [ { x: 1}, { y: 2 }, { z: 3 } ]
    };
    const transform = {
        "$this": "$this",
        "b": "a",
        "b[1].y": "9"
    };
    const output = transformation(transform, input);
    assertEquals(output.a[1].y, 2);
});