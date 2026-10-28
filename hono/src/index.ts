import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import measurementsRoute from "./routes/measurements";

const app = new Hono();

app.use(logger());
app.use(cors());
app.route("/", measurementsRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
