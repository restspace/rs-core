import { assertStrictEquals, assertThrows } from "std/testing/asserts.ts";
import { getProp, setProp, deleteProp } from '../utility/utility.ts';

Deno.test('getProp from null', function () {
    assertThrows(() => v = getProp(null, "abc"));
});
Deno.test('getProp string', function () {
    const v = getProp({ a: [ 'x', 'y', 'z' ] }, "a.1");
    assertStrictEquals(v, 'y');
});
Deno.test('getProp array', function () {
    const v = getProp([ { a: 1, b: 2}, true, true ], [ '0', 'a' ]);
    assertStrictEquals(v, 1);
});
Deno.test('setProp empty', function () {
    const v = {}
    setProp(v, [ '0', 'a' ], 'hello');
    assertStrictEquals(v[0].a, 'hello');
});
Deno.test('setProp nml', function () {
    const v = { x: { a: 2, b: 3 } };
    setProp(v, [ 'x', 'a' ], 4);
    assertStrictEquals(v.x.a, 4);
});
Deno.test('setProp null', function () {
    const v = null;
    setProp(v, [ 'x', 'a' ], 4);
    assertStrictEquals(v, null);
});
Deno.test('deleteProp', function () {
    const v = { x: { a: 2, b: 3 } };
    deleteProp(v, [ 'x', 'a' ]);
    assertStrictEquals(v.x.a, undefined);
});
Deno.test('deleteProp missing', function () {
    const v = { x: { a: 2, b: 3 } };
    deleteProp(v, [ 'x', 'q' ]);
    assertStrictEquals(v.x.a, 2);
});


    