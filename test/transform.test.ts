import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { transformation } from '../transformation/transformation.ts';
import { VariableScope } from '../VariableScope.ts'; // Replace 'path/to/VariableScope' with the actual path to the VariableScope module
import { Url } from "../Url.ts";

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
Deno.test('primitives non string', function () {
    const input = {
        a: 1,
        b: 2
    };
    const transform = {
        q: "a",
        r: 2,
        s: {
            t: true
        }
    };
    const output = transformation(transform, input);
    assertEquals(output.q, 1);
    assertEquals(output.r, 2);
    assertEquals(output.s.t, true);
});
Deno.test('parseInt', function () {
    const input = {
        a: 1,
        b: "2"
    };
    const transform = {
        q: "parseInt(b)"
    };
    const output = transformation(transform, input);
    assertEquals(output.q, 2);
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
Deno.test('this property', function () {
    const input = [1,2,3];
    const transform = {
        "abc": "$this"
    };
    const output = transformation(transform, input);
    assertEquals(output.abc, [1,2,3]);
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
Deno.test('this string', function () {
    const input = "hello";
    const transform = {
        "a": "$"
    };
    const output = transformation(transform, input);
    assertEquals(output.a, "hello");
});

Deno.test('path key existing', function () {
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

Deno.test('path key new', function () {
    const input = {
        a: "xyz"
    };
    const transform = {
        "b.x": "'zzz'"
    };
    const output = transformation(transform, input);
    assertEquals(output.b.x, "zzz");
});

Deno.test('path key lvl 2', function () {
    const input = {
        a: "xyz",
        b: {
            x: {
                p: "mno",
                q: 123
            },
            y: "pqr"
        }
    };
    const transform = {
        "$this": "$this",
        "b.x.p": "b.x.q",
        "b.x.q": "undefined"
    };
    const output = transformation(transform, input);
    assertEquals(output.b.x.p, 123);
    assert(output.b.x.q === undefined);
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

Deno.test('path object/list loop', function () {
    const input = {
        a: "xyz",
        b: { a: [ { a: 1 }, { a: 2 }, { a: 3 } ], b: [ { a: 4 }, { a: 5 }, { a: 6 } ] }
    };
    const transform = {
        "$": "$",
        "b{prop}.[item]": "prop.key + a"
    };
    const output = transformation(transform, input);
    assertEquals(output.b, { a: [ "a1", "a2", "a3" ], b: [ "b4", "b5", "b6" ] });
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
        "$": "$",
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
        "$": "$",
        "[item]": "item.value"
    };
    const output = transformation(transform, input);
    assertEquals(output, [ 1, 2, 3 ]);
});

Deno.test('list multilevel', function () {
    const input = [
        {
            val: [ 1, 10, 100 ]
        },
        {
            val: [ 2, 20, 200 ]
        },
        {
            val: [ 3, 30, 300 ]
        }
    ];
    const transform = {
        "$": "$",
        "[item].val[subitem]": "subitem.value * 2"
    };
    const output = transformation(transform, input);
    assertEquals(output, [ { val: [ 2, 20, 200 ] }, { val: [ 4, 40, 400 ] }, { val: [ 6, 60, 600 ] } ]);
});

Deno.test('list flatten', function () {
    const input = {
        list: [
            {
                val: [ 1, 10, 100 ]
            },
            {
                val: [ 2, 20, 200 ]
            },
            {
                val: [ 3, 30, 300 ]
            }
        ],
        x:[]
    };
    const transform = {
        "$this": "$this",
        "list[item].val[subitem]": "outer.x.push(subitem.value)"
    };
    const output = transformation(transform, input);
    assertEquals(output.x, [1, 10, 100, 2, 20, 200, 3, 30, 300]);
});

Deno.test('inner loop index', function () {
    const input = {
        list: [
            {
                val: [ { a:1 }, { a:10 }, { a:100 } ]
            },
            {
                val: [ { a:2 }, { a:20 }, { a:200 } ]
            },
            {
                val: [ { a:3 }, { a:30 }, { a:300 } ]
            }
        ],
        x:[]
    };
    const transform = {
        "$this": "$this",
        "list[item].val[subitem]": "outer.x.push(subitem.value.a)"
    };
    const output = transformation(transform, input);
    assertEquals(output.x, [1, 10, 100, 2, 20, 200, 3, 30, 300]);
});

Deno.test('index non list', function () {
    const input = {
        notAList: "abc"
    };
    const transform = {
        "$this": "$this",
        "notAList[item]": "val"
    };
    const output = transformation(transform, input);
    assertEquals(output.notAList, "abc");
});

Deno.test('index null', function () {
    const input = {
        notAList: null,
        a: 1
    };
    const transform = {
        "$this": "$this",
        "notAList.xxx[item]": "val"
    };
    const output = transformation(transform, input);
    assertEquals(output, { a: 1, notAList: null });
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
Deno.test('variables set', function () {
    const input = {
        a: [ { x: 1}, { y: 2 }, { z: 3 } ]
    };
    const transform = {
        "$this": "$this",
        "$xyz": "a[2].z"
    };
    const variables = new VariableScope({});
    const _output = transformation(transform, input, undefined, undefined, variables);
    assertEquals(variables.get('$xyz'), 3);
});
Deno.test('variables use', function () {
    const input = {
        a: [ { x: 1}, { y: 2 }, { z: 3 } ]
    };
    const transform = {
        "$this": "$this",
        "$xyz": "a[2].z",
        "$$val": "$xyz * 2"
    };
    const variables = new VariableScope({});
    const output = transformation(transform, input, undefined, undefined, variables);
    assertEquals(output.$val, 6);
});

Deno.test('unique function', function () {
    const input = { x: [ "abc", "abd", "abc" ] };
    const transform = {
        "$this": "unique(x)"
    };
    const output = transformation(transform, input);
    console.log(JSON.stringify(output));
    assertEquals(output.length, 2);
});

Deno.test('transform expression function', function () {
    const input = {
        a: [ 1, 2, 3 ]
    };
    const transform = {
        "$this": [
            "expressionMap()",
            "a",
            "$ * 2"
        ]
    };
    const output = transformation(transform, input);
    assertEquals(output, [ 2, 4, 6 ]);
});

Deno.test('groupBy function', function () {
    const input = [
        { a: 1, b: 2 },
        { a: 1, b: 3 },
        { a: 2, b: 4 }
    ];
    const transform = {
        "$this": "expressionGroup($this, 'a')"
    };
    const output = transformation(transform, input);
    assertEquals(output, { 1: [ { a: 1, b: 2 }, { a: 1, b: 3 } ], 2: [ { a: 2, b: 4 } ] });
});

Deno.test('min/max functions', function () {
    const input = [ 1, 2, 3 ];
    const transform = {
        "min": "expressionMin($this, '$this')",
        "max": "expressionMax($this, '$this * 2')"
    };
    const output = transformation(transform, input);
    assertEquals(output.min, 1);
    assertEquals(output.max, 6);
});

Deno.test('path function', function () {
    const input = {
        a: [ { x: 1 }, { x: 2 }, { x: 3 } ]
    };
    const transform = {
        "lastx": "path('/a[last()]/x', $this)",
    };
    const output = transformation(transform, input);
    assertEquals(output.lastx, 3);
});

Deno.test('path function 2', function () {
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
    const transform = {
        "lastx": "path('/a', $this)",
    };
    const output = transformation(transform, input);
    assertEquals(output.lastx, [ 1, 9, 3, 5 ]);
});

Deno.test('entity change function', function () {
    const input = {
        a: [
            { id: 1, val: "hello" },
            { id: 2, val: "goodbye" },
            { id: 3, val: "same"}
        ],
        b: [
            { id: 2, val: "bye bye" },
            { id: 3, val: "same" },
            { val: "hi"},
            { val: "boo"}
        ]
    };
    const transform = {
        "changes": "entityChange(a, b, 'id')",
    };
    const output = transformation(transform, input);
    console.log(output);
});
Deno.test('pathPattern function with urlIn', function () {
    const input = {
        id: '123',
        name: 'John Doe'
    };
    const transform = {
        "pattern": "pathPattern('/users/$<0', true, 'https://api.example.com/v1')",
    };
    const output = transformation(transform, input);
    assertEquals(output.pattern, '/users/v1');
});

Deno.test('pathPattern function with urlIn and query parameters', function () {
    const input = {
        id: '456',
        query: 'active=true&role=admin'
    };
    const transform = {
        "pattern": "pathPattern('/users/$>0/${id}?${query}', true, 'https://api.example.com/v2')",
    };
    const output = transformation(transform, input);
    assertEquals(output.pattern, '/users/v2/456?active=true&role=admin');
});

Deno.test('pathPattern function with urlIn and special characters', function () {
    const input = {
        name: 'John Doe',
        specialChar: '?&='
    };
    const transform = {
        "pattern": "pathPattern('/users/$?(abc)/${name}/${specialChar}', true, 'https://api.example.com/?abc=123')",
    };
    const output = transformation(transform, input);
    assertEquals(output.pattern, '/users/123/John Doe/?&=');
});
Deno.test('pathPattern function two params', function () {
    const input = {
        name: 'John Doe',
        specialChar: '?&='
    };
    const transform = {
        "pattern": "pathPattern('/users/$?(abc)/${name}/${specialChar}', true)",
    };
    const output = transformation(transform, input, new Url('https://api.example.com/?abc=123'));
    assertEquals(output.pattern, '/users/123/John Doe/?&=');
});

Deno.test('pathPattern with variable', function () {
    const input = {
        name: 'John Doe',
        specialChar: '?&='
    };
    const transform = {
        "pattern": "pathPattern('/users/$?(abc)/${name}/${$var}', true)",
    };
    const output = transformation(transform, input, new Url('https://api.example.com/?abc=123'),
        'myname', new VariableScope({}).set('$var', 'varval'));
    assertEquals(output.pattern, '/users/123/John Doe/varval');
});

//test for pathPattern which calls it with two arguments and passes in the 

Deno.test('path pattern function', function () {
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
    const transform = {
        "lastx": "path('/a', $this)",
    };
    const output = transformation(transform, input);
    assertEquals(output.lastx, [ 1, 9, 3, 5 ]);
});
Deno.test('expressionReduce function', function () {
    const input = [
        "a", "b", "c"
    ];
    const transform = {
        "reduce": "expressionReduce($, '', '$previous + $')"
    };
    const output = transformation(transform, input);
    assertEquals(output.reduce, "abc");
});
