import "server-only";
import {
  addJob,createProject,deleteProject,getJob,getProject,listJobs,listProjects,patchJob,updateProject,
} from "./db";

/**
 * 本地 MVP 的持久化边界。页面和工作流可以逐步改为依赖此接口，
 * 以后迁移 SQLite 时只需替换实现，而不必改动业务数据结构。
 */
export const projectRepository={
  list:listProjects,
  get:getProject,
  create:createProject,
  update:updateProject,
  delete:deleteProject,
};

export const jobRepository={
  list:listJobs,
  get:getJob,
  create:addJob,
  update:patchJob,
};
