import { Application, Container, Sprite, Texture } from "pixi.js";

import { Descriptor, Schema } from "@bevy-ts/core";
import { NodeRegistry, RenderSync } from "@bevy-ts/pixi";

export interface BrowserExampleHandle {
  destroy(): Promise<void>
}

// ECS-owned simulation data.
const Position = Descriptor.Component<{ x: number; y: number }>()(
  "Position",
);
const Velocity = Descriptor.Component<{ x: number; y: number }>()(
  "Velocity",
);
const Renderable = Descriptor.Component<{ size: number }>()("Renderable");
const Tint = Descriptor.Component<{ value: number }>()("Tint");

// Per-frame world data captured from the host renderer.
const DeltaTime = Descriptor.Resource<number>()("DeltaTime");
const Viewport = Descriptor.Resource<{ width: number; height: number }>()(
  "Viewport",
);

// Host-side renderer bridge. ECS owns simulation state; Pixi owns renderer objects.
const PixiHost = Descriptor.Service<{
  readonly application: Application;
  readonly scene: Container;
  readonly clock: {
    deltaSeconds: number;
  };
}>()("PixiHost");
const Sprites = Descriptor.Service<NodeRegistry.NodeRegistry<Sprite>>()("Sprites");

const pixiSchema = Schema.fragment({
  components: {
    Position,
    Velocity,
    Renderable,
    Tint,
  },
  resources: {
    DeltaTime,
    Viewport,
  },
});

const Game = Schema.bind(pixiSchema);
const schema = Game.schema;

const SetupSceneSystem = Game.System(
  "SetupSceneSystem",
  {
    services: {
      pixi: Game.System.service(PixiHost),
    },
  },
  ({ commands, services }) =>
    {
      const { width, height } = services.pixi.application.screen;
      const palette = [
        0xff6b35, 0xf7c948, 0x4ecdc4, 0x2d6cdf, 0xf25f5c, 0x7bd389,
      ] as const;

      for (let index = 0; index < 12; index += 1) {
        const angle = (Math.PI * 2 * index) / 12;
        const speed = 70 + index * 8;
        const size = 18 + (index % 4) * 6;
        const tint = palette[index % palette.length] ?? palette[0];

        commands.spawn(
          Game.Command.spawn(
            [
              Position,
              {
                x: width * 0.5 + Math.cos(angle) * 140,
                y: height * 0.5 + Math.sin(angle) * 90,
              },
            ],
            [
              Velocity,
              {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed,
              },
            ],
            [
              Renderable,
              {
                size,
              },
            ],
            [
              Tint,
              {
                value: tint,
              },
            ],
          ),
        );
      }
    },
);

const CaptureFrameInputSystem = Game.System(
  "CaptureFrameInputSystem",
  {
    resources: {
      deltaTime: Game.System.writeResource(DeltaTime),
      viewport: Game.System.writeResource(Viewport),
    },
    services: {
      pixi: Game.System.service(PixiHost),
    },
  },
  ({ resources, services }) =>
    {
      resources.deltaTime.set(services.pixi.clock.deltaSeconds);
      resources.viewport.set({
        width: services.pixi.application.screen.width,
        height: services.pixi.application.screen.height,
      });
    },
);

const IntegrateMotionSystem = Game.System(
  "IntegrateMotionSystem",
  {
    queries: {
      moving: Game.Query({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.read(Velocity),
        },
      }),
    },
    resources: {
      deltaTime: Game.System.readResource(DeltaTime),
    },
  },
  ({ queries, resources }) =>
    {
      const dt = resources.deltaTime.get();
      for (const match of queries.moving.each()) {
        const position = match.data.position.get();
        const velocity = match.data.velocity.get();

        match.data.position.set({
          x: position.x + velocity.x * dt,
          y: position.y + velocity.y * dt,
        });
      }
    },
);

const BounceWithinViewportSystem = Game.System(
  "BounceWithinViewportSystem",
  {
    queries: {
      moving: Game.Query({
        selection: {
          position: Game.Query.write(Position),
          velocity: Game.Query.write(Velocity),
          renderable: Game.Query.read(Renderable),
        },
      }),
    },
    resources: {
      viewport: Game.System.readResource(Viewport),
    },
  },
  ({ queries, resources }) =>
    {
      const viewport = resources.viewport.get();
      for (const match of queries.moving.each()) {
        const position = match.data.position.get();
        const velocity = match.data.velocity.get();
        const { size } = match.data.renderable.get();

        let nextPosition = position;
        let nextVelocity = velocity;

        if (
          position.x <= size * 0.5 ||
          position.x >= viewport.width - size * 0.5
        ) {
          nextVelocity = {
            x: velocity.x * -1,
            y: velocity.y,
          };
          nextPosition = {
            x: Math.min(
              Math.max(position.x, size * 0.5),
              viewport.width - size * 0.5,
            ),
            y: position.y,
          };
        }

        if (
          position.y <= size * 0.5 ||
          position.y >= viewport.height - size * 0.5
        ) {
          nextVelocity = {
            x: nextVelocity.x,
            y: velocity.y * -1,
          };
          nextPosition = {
            x: nextPosition.x,
            y: Math.min(
              Math.max(position.y, size * 0.5),
              viewport.height - size * 0.5,
            ),
          };
        }

        if (nextPosition !== position) {
          match.data.position.set(nextPosition);
        }

        if (nextVelocity !== velocity) {
          match.data.velocity.set(nextVelocity);
        }
      }
    },
);

// Pixi owns the sprites; RenderSync keeps one per Renderable entity in sync.
const render = RenderSync.systems(Game, {
  name: "Render",
  renderable: Renderable,
  transform: Position,
  registry: Sprites,
  select: { tint: Game.Query.read(Tint) },
  create: ({ renderable, data }) => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.anchor.set(0.5);
    sprite.width = renderable.size;
    sprite.height = renderable.size;
    sprite.tint = data.tint.get().value;
    return sprite;
  },
  apply: (sprite, { transform }) => {
    sprite.position.set(transform.x, transform.y);
  },
});

const setupSchedule = Game.Schedule(
  SetupSceneSystem,
  Game.Schedule.applyDeferred(),
  render.create,
);

const updateSchedule = Game.Schedule(
  CaptureFrameInputSystem,
  IntegrateMotionSystem,
  BounceWithinViewportSystem,
  render.destroy,
  render.create,
  render.sync,
);

/**
 * Starts the bouncing Pixi integration demo inside a host container.
 */
export const startPixiExample = async (
  mount: HTMLElement,
): Promise<BrowserExampleHandle> => {
  const application = new Application();
  await application.init({
    antialias: true,
    background: "#101418",
    resizeTo: mount,
  });

  const wrapper = document.createElement("section");
  wrapper.className = "pixi-example-shell";
  wrapper.appendChild(application.canvas);
  mount.replaceChildren(wrapper);

  const scene = new Container();
  application.stage.addChild(scene);

  const sprites = NodeRegistry.inContainer<Sprite>(scene);
  const host = {
    application,
    scene,
    clock: {
      deltaSeconds: 1 / 60,
    },
  };

  const runtime = Game.Runtime.make({
    services: Game.Runtime.services(
      Game.Runtime.service(PixiHost, host),
      Game.Runtime.service(Sprites, sprites),
    ),
    resources: {
      DeltaTime: host.clock.deltaSeconds,
      Viewport: {
        width: application.screen.width,
        height: application.screen.height,
      },
    },
  });
  runtime.tick(setupSchedule);
  runtime.tick(updateSchedule);

  const tick = (ticker: { readonly deltaMS: number }) => {
    host.clock.deltaSeconds = ticker.deltaMS / 1000;
    runtime.tick(updateSchedule);
  };

  application.ticker.add(tick);

  return {
    async destroy() {
      application.ticker.remove(tick);
      sprites.clear();
      application.destroy(true);
      mount.replaceChildren();
    },
  };
};
