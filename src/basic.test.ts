import {describe, expect, it} from "vitest";
import {createWorld, relation, trait} from "koota";
import {createTreeQuery, createTreeQueryFilter} from "./tree-query.ts";

describe('basics covered', () => {

  const A = trait();
  const B = trait();
  const C = trait();
  const D = trait();
  const E = trait();

  const IsParentOf = relation();
  const IsChildOf = relation();

  const HasChild = createTreeQueryFilter((e1, e2, _world) => {
    return e1.has(IsParentOf(e2))
  });


  it("handles a deeply nested tree", () => {
    const world = createWorld();
    for (let i = 0; i < 100; i++) world.spawn(); // just to make sure the world contains other stuff

    const treeRoot =
      world.spawn(A, IsParentOf(
        world.spawn(B, IsParentOf(
          world.spawn(C, IsParentOf(
            world.spawn(D, IsParentOf(
              world.spawn(E)
            ))
          ))
        ))
      ));


    const TreeRoot = createTreeQuery(
      A, HasChild(
        B, HasChild(
          C, HasChild(
            D, HasChild(
              E))))
    );


    // query for an entity that matches this exact tree structure
    expect(TreeRoot(world).length).toBe(1);
    expect(TreeRoot(world)).toContain(treeRoot);

    // delete any part of it and the query no longer matches
    world.queryFirst(E)!.destroy();
    expect(TreeRoot(world).length).toBe(0);

  });


  it(`allows querying for "emergent" tree structures (e.g. siblings)`, () => {

    const world = createWorld();
    for (let i = 0; i < 100; i++) world.spawn(); // just to make sure the world contains other stuff

    const parent = world.spawn(A);
    const child1 = world.spawn(B);
    const child2 = world.spawn(B);


    // e1 is parent to e2, e3
    parent.add(IsParentOf(child1), IsParentOf(child2));
    child1.add(IsChildOf(parent));
    child2.add(IsChildOf(parent));


    const HasSiblings = createTreeQueryFilter((e1, e2, _world) => {
      const parentOfEntity1 = e1.targetFor(IsChildOf);
      const parentOfEntity2 = e2.targetFor(IsChildOf);

      return (parentOfEntity1 === parentOfEntity2) && (parentOfEntity1 !== undefined) && (e1 !== e2);
    });

    // right now there are two siblings
    const siblings = createTreeQuery(HasSiblings());
    expect(siblings(world).length).toBe(2);
    expect(siblings(world)).toContain(child1);
    expect(siblings(world)).toContain(child2);


    const Foo = trait();
    const Bar = trait();
    const HasSiblingWithFoo = createTreeQuery(HasSiblings(Foo), /*Bar*/);
    const HasSiblingWithBar = createTreeQuery(HasSiblings(Bar), /*Foo*/);

    expect(HasSiblingWithFoo(world).length).toBe(0);
    expect(HasSiblingWithBar(world).length).toBe(0);

    child1.add(Foo);
    child2.add(Bar);

    expect(HasSiblingWithFoo(world).length).toBe(1);
    expect(HasSiblingWithFoo(world)).toContain(child2);
    expect(HasSiblingWithBar(world).length).toBe(1);
    expect(HasSiblingWithBar(world)).toContain(child1);
  });


});