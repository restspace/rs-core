import { assert, assertEquals, assertStrictEquals, assertThrows } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { getProp, setProp, deleteProp, patch, canonicaliseName } from '../utility/utility.ts';
import { stripHtmlTags } from '../utility/html.ts';

Deno.test('getProp from null', function () {
    assertThrows(() => {
        const v = getProp(null, "abc");
    });
});
Deno.test('getProp string', function () {
    const v = getProp({ a: [ 'x', 'y', 'z' ] }, "a.1");
    assertStrictEquals(v, 'y');
});
Deno.test('getProp array', function () {
    const path = [ '0', 'a' ];
    const v = getProp([ { a: 1, b: 2}, true, true ], path);
    assertStrictEquals(v, 1);
    assertEquals(path, [ '0', 'a' ]);
});
Deno.test('setProp empty', function () {
    const v = {} as any;
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

Deno.test('patch primitive', function() {
    const targ = 1;
    const patchData = 2;
    const patched = patch(targ, patchData);
    assertStrictEquals(patched, 2);
});
Deno.test('patch object', function() {
    const targ = { a: 1, b: 2 };
    const patchData = { a: 3 };
    const patched = patch(targ, patchData);
    assertEquals(patched, { a: 3, b: 2 });
});
Deno.test('patch list positional', function() {
    const targ = [ 1, 2, 3, 4 ];
    const patchData = [ 5, 5, 5 ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ 5, 5, 5, 4 ]);
});
Deno.test('patch list positional longer', function() {
    const targ = [ 1, 2, 3, 4 ];
    const patchData = [ 5, 5, 5, 5, 5 ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ 5, 5, 5, 5, 5 ]);
});
Deno.test('patch list append', function() {
    const targ = [ 1, 2, 3, 4 ];
    const patchData = [ { '$strategy': 'append' }, 5, 5 ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ 1, 2, 3, 4, 5, 5 ]);
});
Deno.test('patch list prepend', function() {
    const targ = [ 0, 1, 2, 3, 4 ];
    const patchData = [ { '$strategy': 'prepend' }, 5, 5 ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ 5, 5, 0, 1, 2, 3, 4 ]);
});
Deno.test('patch list id-replace', function() {
    const targ = [ { name: 'a', val: 'xxx' }, { name: 'b', val: 'yyy' } ];
    const patchData = [ { '$strategy': 'id-replace', '$id': 'name' }, { name: 'b', val: 'bbb' }, { name: '', val: 'ccc' } ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ { name: 'b', val: 'bbb' }, { name: '', val: 'ccc' } ]);
});
Deno.test('patch list id-patch', function() {
    const targ = [ { name: 'a', val: 'xxx' }, { name: 'b', val: 'yyy' } ];
    const patchData = [ { '$strategy': 'id-patch', '$id': 'name' }, { name: 'b', val: 'bbb' }, { name: 'c', val: 'ccc' } ];
    const patched = patch(targ, patchData);
    assertEquals(patched, [ { name: 'a', val: 'xxx' }, { name: 'b', val: 'bbb' }, { name: 'c', val: 'ccc' } ]);
});
Deno.test('patch list add list with patch config', function() {
    const targ = [
        { name: 'a', val: [ 'xxx', 'yyy' ] },
        { name: 'b', val: [ 'ppp', 'qqq' ] }
    ];
    const patchData = [
        { '$strategy': 'id-replace', '$id': 'name' },
        { name: 'b', val: [ 'bbb' ] },
        { name: 'c', val: [ { '$strategy': 'replace' }, 'nnn' ] }
    ];
    const patched = patch(targ, patchData);
    assertEquals(patched[1].val[0], 'nnn');
});
Deno.test('canonicalise name', function() {
    const canon = canonicaliseName('Le-Carré Supplies', 12);
    assertEquals(canon, 'lecarresuppl');
});
Deno.test('html strip p to newline', function() {
    const stripped = stripHtmlTags('<p></p><p>hello</p><p>goodbye</p>', true);
    assertEquals(stripped, '\nhello\ngoodbye');
});


    