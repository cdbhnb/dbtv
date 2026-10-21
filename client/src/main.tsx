import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './app';
import NavigationScroll from './NavigationScroll';
import {RatingProvider} from './ratings';
import {PreviewProvider} from './cinema/Preview';
import './style.css';
import './config.css';
import './editor.css';
import './pager.css';
import './player.css';
import './product.css';
import './themes.css';
import './cinema/cinema.css';
import './ratings.css';

createRoot(document.getElementById('root')!).render(<BrowserRouter><NavigationScroll/><RatingProvider><PreviewProvider><App/></PreviewProvider></RatingProvider></BrowserRouter>);
