import {createWorld, Not, trait} from "koota";
import {createTreeQuery, createTreeQueryFilter} from "./tree-query.ts";
import {describe, expect, it} from "vitest";


describe('Space Wars', () => {

  it("spaceships, pickups, explosives", () => {
    const world = createWorld();
    for (let i = 0; i < 100; i++) world.spawn(); // just to make sure the world contains other stuff


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

    // ---------------------------------------------------------------------------------------------------


    // spawn spaceship
    const spaceship = world.spawn(IsSpaceship, Radius({value: 10}), Position({x: 0, y: 0}));

    // spawn health pickups
    const pickup1 = world.spawn(IsHealthPickup, Radius({value: 1}), Position({x: 20, y: 0}));
    // @ts-ignore: IDE complains pickup2 stays unused
    const pickup2 = world.spawn(IsHealthPickup, Radius({value: 1}), Position({x: 0, y: 20}));
    const pickup3 = world.spawn(IsHealthPickup, Radius({value: 1}), Position({x: 20, y: 20}));


    // example query 1: check for spaceships that have pickups in range
    const spaceshipsWithPickupsInRange = createTreeQuery(
      IsSpaceship, Radius, Position,
      InPickupRange(IsHealthPickup, Radius, Position) // the filter needs all these to be present
    );

    // none yet
    expect(spaceshipsWithPickupsInRange(world).length).toBe(0);


    // example query2 : check for pickups that are in range of a spaceship
    const pickupsThatHaveASpaceshipInRange = createTreeQuery(
      IsHealthPickup, Radius, Position,
      InPickupRange(IsSpaceship, Radius, Position)
    );

    expect(pickupsThatHaveASpaceshipInRange(world).length).toBe(0);


    // move the spaceship closer to one of the pickups
    spaceship.set(Position, {x: 19, y: 1});

    // we're in range now
    expect(spaceshipsWithPickupsInRange(world).length).toBe(1);
    expect(spaceshipsWithPickupsInRange(world)).toContain(spaceship);

    expect(pickupsThatHaveASpaceshipInRange(world).length).toBe(1);
    expect(pickupsThatHaveASpaceshipInRange(world)).toContain(pickup1);


    // ------------------------------------------------------------------


    // now let's add some spice
    const IsExplosiveOnContact = trait();
    const explosive1 = world.spawn(IsExplosiveOnContact, Radius({value: 2}), Position({x: 29, y: 1}));
    const explosive2 = world.spawn(IsExplosiveOnContact, Radius({value: 2}), Position({x: 19, y: 11}));

    const explosivesAboutToGoBoom = createTreeQuery(
      Radius, Position, IsExplosiveOnContact,
      // we say that bombs don't interact with other bombs or health pickups, but
      // changing that would simply mean removing these two
      InPickupRange(Radius, Position, Not(IsExplosiveOnContact), Not(IsHealthPickup))
    );


    expect(explosivesAboutToGoBoom(world).length).toBe(2);
    expect(explosivesAboutToGoBoom(world)).toContain(explosive1);
    expect(explosivesAboutToGoBoom(world)).toContain(explosive2);
    // our pilot barely gets out of range in time
    spaceship.set(Position, prev => {
      prev.x -= 2;
      prev.y -= 2;
      return prev;
    });
    expect(explosivesAboutToGoBoom(world).length).toBe(0);


    // to showcase some of the arbitrary nesting:
    // (important: omitting position and radius for brevity, but we should never
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

    pickup3.set(Position, ({x: 17, y: -1}));
    pickup3.set(Radius, ({value: 11}));
    expect(spaceshipsLivingDangerously(world).length).toBe(1);
    expect(spaceshipsLivingDangerously(world)).toContain(spaceship);

    // ----------------------------------------------------------------
  });
});


