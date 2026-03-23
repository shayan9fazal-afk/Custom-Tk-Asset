import { Router, type IRouter } from "express";
import healthRouter from "./health";
import youtubeRouter from "./youtube";
import downloaderRouter from "./downloader";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/youtube", youtubeRouter);
router.use("/downloader", downloaderRouter);

export default router;
