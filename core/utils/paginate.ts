export const paginated = async (
  limit: number,
  callback: (offset: number, limit: number) => Promise<number>,
) => {
  let length = 0;
  let offset = 0;

  do {
    length = await callback(offset, limit);

    offset += limit;
  } while (length === limit);
};
