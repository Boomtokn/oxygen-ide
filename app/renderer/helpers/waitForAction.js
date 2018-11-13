/*
 * Copyright (C) 2015-2018 CloudBeat Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
export default function waitForAction(type, action$) {
    return new Promise((resolve, reject) => {
        let subscription = action$.pipe(filter(action => action.type === type)).subscription(action => {
            resolve(action);
        });
    });
}
