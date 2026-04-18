// @deno-types="npm:@types/ejs"
import ejs from "ejs";
import handlebars from "handlebars";

export const ejsRender = (content: string, data?: ejs.Data) => {
  return ejs.render(content, data, { async: true });
};

export const handlebarsRender = (content: string, data?: ejs.Data) => {
  return handlebars.compile(content)(data);
};
