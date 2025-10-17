import {createTreeQueryFilter} from "./create-tree-query-filter.ts";
import {createWorld, trait} from "koota";
import {createTreeQuery} from "./tree-query.ts";


/*

=============================================================================

Check the tests for real examples:


=============================================================================

 */


const world = createWorld();


const NotItself = createTreeQueryFilter((eid1, eid2, _world) => {
  return (eid1 !== eid2);
});

const Foo = trait();
const Bar = trait();


const query = createTreeQuery(Foo, Bar, NotItself(Foo, Bar));


{
  const res = query(world);
  console.log(res);
}

// spawn one entity
world.spawn(Foo, Bar);

{
  const res = query(world);
  console.log(res);
}


// spawn a second one
world.spawn(Foo, Bar);
{
  const res = query(world);
  console.log(res);
}
