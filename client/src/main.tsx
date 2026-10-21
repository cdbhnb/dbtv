import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './app';
import './style.css';
import './config.css';
import './editor.css';
import './pager.css';
import './player.css';
import './product.css';
import './themes.css';

createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
