import { assertEquals, assertThrows } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { resolvePathPatternWithObject, resolvePathPattern, resolvePathPatternWithUrl } from '../PathPattern.ts';
import { Url } from "../Url.ts";

Deno.test('matches a single path el', function () {
    let res = resolvePathPattern("a/$>1/b", "/xyz/qqq/abc");
    assertEquals(res, 'a/qqq/b');
    res = resolvePathPattern("a/$<1/b", "/xyz/qqq/abc/nnn");
    assertEquals(res, 'a/abc/b');
});
Deno.test('missing single path el', function () {
    let res = resolvePathPattern("a/$>1/b", "/xyz");
    assertEquals(res, 'a/b')
});
Deno.test('matches a range', function () {
    let res = resolvePathPattern("a/$B<2<1/b", "/xyz/qqq/abc", "/lll/mmm/nnn/ppp");
    assertEquals(res, 'a/mmm/nnn/b');
    res = resolvePathPattern("a/$B<2<0/b", "/xyz/qqq/abc", "/lll/mmm/nnn/ppp");
    assertEquals(res, 'a/mmm/nnn/ppp/b');
});
Deno.test('matches default string', function () {
    let res = resolvePathPattern("a/$>1:(qqq)/b", "/xyz");
    assertEquals(res, 'a/qqq/b');
    res = resolvePathPattern("a/b/$>1:$>0", "/xyz");
    assertEquals(res, 'a/b/xyz');
});
Deno.test('matches query element', function () {
    let res = resolvePathPattern("a/$?(q)/b", "/xyz", '', '', '', { p: [ "9" ], q: [ "1" ] });
    assertEquals(res, 'a/1/b');
});
Deno.test('missing query element', function () {
    let res = resolvePathPattern("a/$?(x)/b", "/xyz", '', '', '', { p: [ "9" ], q: [ "1" ] });
    assertEquals(res, 'a//b');
});
Deno.test('matches whole query', function () {
    let res = resolvePathPattern("a/b?$?*", "/xyz", '', '', '', { p: [ "9" ], q: [ "1" ] });
    assertEquals(res, 'a/b?p=9&q=1');
});
Deno.test('works with no query and query subs', function () {
    let res = resolvePathPattern("a/b/$?*$?(ab)", "/xyz", "", "");
    assertEquals(res, 'a/b/'); 
});
Deno.test('matches a single prop correctly', function () {
    const res = resolvePathPatternWithObject("a/b/${prop}", { prop: 'def' }, [], '');
    assertEquals(res, 'a/b/def');
});
Deno.test('matches whole input correctly', function () {
    const res = resolvePathPatternWithObject("a/b/${}", 'def', [], '');
    assertEquals(res, 'a/b/def');
});
Deno.test('handles empty list substitution', function () {
    const res = resolvePathPatternWithObject("a/b/${[]}", [], [], '');
    assertEquals(res, []);
});
Deno.test('throws on insert empty string', function () {
    assertThrows(() => resolvePathPatternWithObject("a/b/${}", '', [], ''));
});
Deno.test('throws on insert non-string', function () {
    assertThrows(() => resolvePathPatternWithObject("a/b/${}", { a: 2 }, [], ''));
});
Deno.test('matches a terminal array correctly', function() {
    const res = resolvePathPatternWithObject("a/b/${prop[]}", { prop: [ 'cde', 'fgh' ] }, [], '');
    assertEquals(res, [ 'a/b/cde', 'a/b/fgh' ]);
});
Deno.test('matches an empty terminal array correctly', function() {
    const res = resolvePathPatternWithObject("a/b/${prop[]}", { prop: [ ] }, [], '');
    assertEquals(res, [ ]);
});
Deno.test('matches a non-terminal array correctly', function() {
    const res = resolvePathPatternWithObject("a/b/${prop[].inner}", { prop: [ { q: 1, inner: 'xxx' }, { q: 2, inner: 'yyy' } ] }, [], '');
    assertEquals(res, [ 'a/b/xxx', 'a/b/yyy' ]);
});
Deno.test('multiplies by multiple array props', function () {
    const res = resolvePathPatternWithObject("a/b/${prop[]}/c/${prop2[]}", { prop: [ 'n', 'm' ], prop2: [ 'x', 'y' ] }, [], '');
    assertEquals(res, [ 'a/b/n/c/x', 'a/b/n/c/y', 'a/b/m/c/x', 'a/b/m/c/y' ]);
});
Deno.test('decodes url segment', function () {
    const url = new Url("/abc/def%2Fghi");
    let res = resolvePathPatternWithUrl("$>1", url, undefined, undefined, true);
    assertEquals(res, 'def/ghi');
    res = resolvePathPatternWithUrl("$>1", url);
    assertEquals(res, 'def%2Fghi');
});
