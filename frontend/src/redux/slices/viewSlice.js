import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeView: "dashboard",
};

const viewSlice = createSlice({
  name: "view",
  initialState,
  reducers: {
    setView: (state, action) => {
      state.activeView = action.payload;
    },
  },
});

export const { setView } = viewSlice.actions;
export default viewSlice.reducer;