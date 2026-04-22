import React from "react";

const DevTaskList = React.lazy(() => import("./DevTaskList"));

export default {
  list: DevTaskList,
  recordRepresentation: (record: { id: number | string; title: string }) =>
    `DEV-${record.id} · ${record.title}`,
};
