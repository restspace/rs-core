import { assert, assertEquals } from "std/testing/asserts.ts";
import { Url } from '../Url.ts';

Deno.test('sets service path correctly', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.servicePath = '/spx/spy';
    assertEquals(url.path, '/base1/base2/spx/spy');
    assert(!url.isRelative);
});
Deno.test('sets subpath correctly', function () {
    const url = new Url('/base1/base2/sp1/sup1/sup2');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ 'sup1', 'sup2' ]);
});
Deno.test('sets subpath correctly, empty', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ ]);
    assertEquals(url.subPathElementCount, 0);
});
Deno.test('sets subpath correctly, empty', function () {
    const url = new Url('/base1/base2/sp1');
    url.basePathElementCount = 2;
    url.setSubpathFromUrl('/base1/base2/sp1');
    assertEquals(url.subPathElements, [ ]);
    assertEquals(url.subPathElementCount, 0);
});
Deno.test('creates a url correctly from a root path', function () {
    const url = Url.fromPath('/');
    assertEquals(url.path, '/');
    assert(!url.isRelative);
});
Deno.test('creates a url correctly from a host with root', function () {
    const url = new Url('http://abc.com/');
    assert(url.isDirectory);
    assert(!url.isRelative);
});
Deno.test('fails on relative path', () => {
    const url = new Url('abc/def');
    assertEquals(url.path, 'abc/def');
    assert(url.isRelative);
});
Deno.test('root domain', () => {
    const url = new Url('https://abc.co.uk');
    assertEquals(url.domain, 'abc.co.uk');
});
Deno.test('query string', () => {
    const url = new Url('/?abc=def');
    assertEquals(url.query['abc'][0], 'def');
});
Deno.test('query string on root domain', () => {
    const url = new Url('http://spot.com?bn1=yyy');
    assertEquals(url.queryString, 'bn1=yyy');
    assert(!url.isRelative);
});
Deno.test('full url', () => {
    const url = new Url('http://spot.com/abc/def?mno=pqr&abc=def#123');
    assertEquals(url.domain, 'spot.com');
    assertEquals(url.scheme, 'http://');
    assertEquals(url.path, '/abc/def');
    assertEquals(url.query['abc'][0], 'def');
    assertEquals(url.fragment, '123');
    assert(!url.isRelative);
});
Deno.test('copy abs', () => {
    const url = new Url('http://spot.com/abc/def?mno=pqr&abc=def#123');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('copy rel', () => {
    const url = new Url('abc/def?mno=pqr&abc=def#123');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('copy site rel', () => {
    const url = new Url('/abc/def?mno=pqr&abc=def#123');
    const url2 = url.copy();
    assertEquals(url.toString(), url2.toString());
});
Deno.test('encodings slash', () => {
    const url = new Url('/abc/def%2Fghi?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def%2Fghi');
    assertEquals(url.toString(), '/abc/def%2Fghi?mno=pqr&abc=def#123');
});
Deno.test('encodings space path output unencoded', () => {
    const url = new Url('/abc/def%20ghi?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def ghi');
    assertEquals(url.toString(), '/abc/def ghi?mno=pqr&abc=def#123');
});
Deno.test('encodings space query output unencoded', () => {
    const url = new Url('/abc/def/ghi?mno=pq r&abc=def#123');
    assertEquals(url.query['mno'][0], 'pq r');
    assertEquals(url.toString(), '/abc/def/ghi?mno=pq r&abc=def#123');
});
Deno.test('subtitution syntax legal', () => {
    const url = new Url('/abc/def${ghi}?mno=pqr&abc=def#123');
    assertEquals(url.pathElements[1], 'def${ghi}');
    assertEquals(url.toString(), '/abc/def${ghi}?mno=pqr&abc=def#123');
});
