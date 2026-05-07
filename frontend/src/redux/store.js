import { configureStore } from "@reduxjs/toolkit";
import viewReducer from "./slices/viewSlice";

export const store = configureStore({
  reducer: {
    view: viewReducer,
  },
});