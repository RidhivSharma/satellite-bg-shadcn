import { ModeToggle } from "@/components/mode-toggle";
import { SatelliteBackground } from "@/components/satellite-bg/satellite-background";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <>
      {/*<SatelliteBackground overlayIds={["demo-card-front"]} />*/}
      <SatelliteBackground overlayIds={["demo-card-behind"]} />
      <main className="relative z-10 min-h-screen p-8 sm:p-12 pointer-events-none">
        <div className="mx-auto flex max-w-4xl flex-col gap-8 pointer-events-auto">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              satellite-bg test harness
            </h1>
            <ModeToggle />
          </header>
          <p className="text-muted-foreground">
            Bare foreground content for developing and previewing the standalone
            background component. Not the final portfolio site.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Card id="demo-card-front">
              <CardHeader>
                <CardTitle>Front card</CardTitle>
                <CardDescription>
                  Placeholder content intended to layer above the background.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  id=&quot;demo-card-front&quot;
                </p>
              </CardContent>
            </Card>
            <Card id="demo-card-behind">
              <CardHeader>
                <CardTitle>Behind card</CardTitle>
                <CardDescription>
                  Placeholder content intended to layer behind the background.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  id=&quot;demo-card-behind&quot;
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
