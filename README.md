# Koota Tree Queries

High performance, nestable queries that let you define
custom filter functions. 

- All entities that are in range of your player? Easy. 
- All entities that are in range 
of your player that are hostile to the player? Sure. 
- All entities that have a yellow pickaxe that was stolen by a Goblin
that's currently fishing? No problem.

```ts
// Step1: define your filter, could be anything

import {createTreeQueryFilter} from "./create-tree-query-filter";
import {createTreeQuery} from "./tree-query";

const Likes = createTreeQueryFilter((entity1, entity2, world) => {
  // use any criteria you'd like: 
  // compute distance between them to see if they're close, 
  // check if they have the same target, roll a dice, 
  // you name it.

  return likes(entiy1, entity2);
});


// Step 2: Create a query
const myQuery = createTreeQuery(Foo, Bar, Likes(Baz))

// returns: all entities that have foo, bar and 
// 'Likes' returns true for at least one entity with Baz!
myQuery(world)

```


### Enhance classic Koota relations
```ts

// two Koota relations: IsParentOf and IsChildOf 
parent.add(IsParentOf(child1), IsParentOf(child2));
child1.add(IsChildOf(parent));
child2.add(IsChildOf(parent));

// Custom Filter Function now lets you query for siblings even 
// though there is no SiblingOf relation defined!
const HasSiblings = createTreeQueryFilter((e1, e2, _world) => {
  const parentOfEntity1 = e1.targetFor(IsChildOf);
  const parentOfEntity2 = e2.targetFor(IsChildOf);

  // we got the same parent! we must be siblings
  return (parentOfEntity1 === parentOfEntity2) && (parentOfEntity1 !== undefined) && (e1 !== e2);
});

// Create a Tree Query 
const siblings = createTreeQuery(HasSiblings(), /* add any extra traits here*/);
expect(siblings(world).length).toBe(2);

// Add extra traits
child1.add(Foo);
child2.add(Bar);

// query more specifically:

// Only siblings that also have Foo and Bar respectively!
const HasSiblingWithFoo = createTreeQuery(HasSiblings(Foo), /*Bar*/);
const HasSiblingWithBar = createTreeQuery(HasSiblings(Bar), /*Foo*/);

expect(HasSiblingWithFoo(world).length).toBe(1);
expect(HasSiblingWithBar(world).length).toBe(1);
expect(HasSiblingWithBar(world)).toContain(child1);
expect(HasSiblingWithFoo(world)).toContain(child2);

```

### Stupid nesting capabilities
```ts
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
```

 
### To abstract? More gamified example:

```ts
const Position = trait({x: 0, y: 0});
const Radius = trait({value: 0});

const IsSpaceship = trait(); 
const IsHealthPickup = trait();  

// our custom query filter function:
const InPickupRange = createTreeQueryFilter((eid1, eid2, _world) => {
  // get both positions. We just assume they exist, the query should be written in a way that guarantees this
  // (just add the traits the filter is using), but we could also write the filter defensively and
  // return false if either entity is missing traits.
  const myPos = eid1.get(Position)!;
  const otherPos = eid2.get(Position)!;

  const myRadius = eid1.get(Radius)!.value;
  const otherRadius = eid2.get(Radius)!.value;

  // check if in range considering center distances and both radii
  const dist = Math.sqrt((myPos.x - otherPos.x) ** 2 + (myPos.y - otherPos.y) ** 2);
  return (dist - otherRadius) <= myRadius;
});


// example query 1: check for spaceships that have pickups in range
const spaceshipsWithPickupsInRange = createTreeQuery(
  IsSpaceship, Radius, Position,
  InPickupRange(IsHealthPickup, Radius, Position) // the filter needs all these to be present
);

// example query2 : check for pickups that are in range of a spaceship
const pickupsThatHaveASpaceshipInRange = createTreeQuery(
  IsHealthPickup, Radius, Position,
  InPickupRange(IsSpaceship, Radius, Position)
);


```

```ts
// let's add some spice: Explosives!
const IsExplosiveOnContact = trait();
const explosive = world.spawn(IsExplosiveOnContact, Radius, Position)


// query for explosives that are closeby!
const explosivesAboutToGoBoom = createTreeQuery(
  Radius, Position, IsExplosiveOnContact,
  // we say that bombs don't interact with other bombs or health pickups, but
  // changing that would simply mean removing these two (restricting to spaceships
  // would just mean adding spaceship as a trait)
  InPickupRange(Radius, Position, Not(IsExplosiveOnContact), Not(IsHealthPickup))
);


// Not enough?

const spaceshipsLivingDangerously = createTreeQuery(
  IsSpaceship, Position, Radius, // spaceships,

  // that are in range of:
  InPickupRange(
    IsHealthPickup, Position, Radius, // health pickups,

    // that are in range of:
    InPickupRange(
      IsExplosiveOnContact, Position, Radius // explosives

      // ... we could continue here
    )
  )
);

```

### Check out the tests for more examples.


## I want to try it!
Sure, just copy the **create-tree-query.ts** and **tree-query.ts** source into your project and you're good to go.