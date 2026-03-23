import { Router, type IRouter } from "express";
import healthRouter from "./health";
import youtubeRouter from "./youtube";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/youtube", youtubeRouter);

export default router;
