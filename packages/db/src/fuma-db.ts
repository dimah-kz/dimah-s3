import { fumadb } from "fumadb";
import { v1 } from "./schema/v1";

export const DimahS3DB = fumadb({
  namespace: "dimah_s3",
  schemas: [v1],
});

export { v1 };
