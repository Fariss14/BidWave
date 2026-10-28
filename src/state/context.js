import { createContext, useContext } from 'react';
export const DemoContext = createContext(null);
export const useDemo = () => useContext(DemoContext);
